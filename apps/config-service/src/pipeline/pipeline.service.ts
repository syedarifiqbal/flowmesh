import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService, PIPELINE_CACHE_TTL } from '../redis/redis.service'
import { CreatePipelineDto } from './dto/create-pipeline.dto'
import { UpdatePipelineDto } from './dto/update-pipeline.dto'

const cacheKey = (workspaceId: string, pipelineId: string) =>
  `config:pipeline:${workspaceId}:${pipelineId}`

const listCacheKey = (workspaceId: string) =>
  `config:pipelines:${workspaceId}`

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectPinoLogger(PipelineService.name) private readonly logger: PinoLogger,
  ) {}

  async create(workspaceId: string, dto: CreatePipelineDto) {
    const pipeline = await this.prisma.pipeline.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        trigger: dto.trigger as object,
        steps: dto.steps as object,
        enabled: dto.enabled ?? true,
      },
    })

    await this.invalidateWorkspaceCache(workspaceId)
    this.logger.info({ pipelineId: pipeline.id, workspaceId }, 'Pipeline created')
    return pipeline
  }

  async findAll(workspaceId: string) {
    const cached = await this.redis.get(listCacheKey(workspaceId))
    if (cached) return JSON.parse(cached)

    const pipelines = await this.prisma.pipeline.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    await this.redis.set(listCacheKey(workspaceId), JSON.stringify(pipelines), PIPELINE_CACHE_TTL)
    return pipelines
  }

  async findOne(workspaceId: string, id: string) {
    const cached = await this.redis.get(cacheKey(workspaceId, id))
    if (cached) return JSON.parse(cached)

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id, workspaceId },
    })

    if (!pipeline) throw new NotFoundException(`Pipeline ${id} not found`)

    await this.redis.set(cacheKey(workspaceId, id), JSON.stringify(pipeline), PIPELINE_CACHE_TTL)
    return pipeline
  }

  async update(workspaceId: string, id: string, dto: UpdatePipelineDto) {
    await this.assertExists(workspaceId, id)

    const pipeline = await this.prisma.pipeline.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.trigger !== undefined && { trigger: dto.trigger as object }),
        ...(dto.steps !== undefined && { steps: dto.steps as object }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    })

    await this.invalidateWorkspaceCache(workspaceId, id)
    this.logger.info({ pipelineId: id, workspaceId }, 'Pipeline updated')
    return pipeline
  }

  async remove(workspaceId: string, id: string) {
    await this.assertExists(workspaceId, id)
    await this.prisma.pipeline.delete({ where: { id } })
    await this.invalidateWorkspaceCache(workspaceId, id)
    this.logger.info({ pipelineId: id, workspaceId }, 'Pipeline deleted')
  }

  private async assertExists(workspaceId: string, id: string) {
    const exists = await this.prisma.pipeline.findFirst({ where: { id, workspaceId } })
    if (!exists) throw new NotFoundException(`Pipeline ${id} not found`)
  }

  private async invalidateWorkspaceCache(workspaceId: string, pipelineId?: string) {
    const keys: string[] = [listCacheKey(workspaceId)]
    if (pipelineId) keys.push(cacheKey(workspaceId, pipelineId))
    await this.redis.del(...keys)
  }
}

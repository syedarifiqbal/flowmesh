import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface ExecutionsQuery {
  pipelineId?: string
  status?: string
  limit?: number
  offset?: number
}

@Injectable()
export class ExecutionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(workspaceId: string, query: ExecutionsQuery) {
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0

    const where: Record<string, unknown> = { workspaceId }
    if (query.pipelineId) where['pipelineId'] = query.pipelineId
    if (query.status) where['status'] = query.status

    const [executions, total] = await Promise.all([
      this.prisma.pipelineExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.pipelineExecution.count({ where }),
    ])

    return { executions, total, limit, offset }
  }

  async findOne(workspaceId: string, id: string) {
    const execution = await this.prisma.pipelineExecution.findFirst({
      where: { id, workspaceId },
    })
    if (!execution) throw new NotFoundException(`Execution ${id} not found`)
    return execution
  }
}

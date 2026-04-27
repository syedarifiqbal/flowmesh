import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { NotFoundException } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { CacheKeyFactory } from '@flowmesh/nestjs-common'
import { PipelineService } from './pipeline.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { CreatePipelineDto } from './dto/create-pipeline.dto'
import { UpdatePipelineDto } from './dto/update-pipeline.dto'

const cacheKey = new CacheKeyFactory('config', 'pipeline')

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

const WORKSPACE_ID = randomUUID()

const makePipeline = (overrides = {}) => ({
  id: randomUUID(),
  workspaceId: WORKSPACE_ID,
  name: 'My Pipeline',
  description: null,
  trigger: { type: 'event', events: ['order.created'] },
  steps: [],
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeDto = (overrides: Partial<CreatePipelineDto> = {}): CreatePipelineDto => ({
  name: 'My Pipeline',
  trigger: { type: 'event', events: ['order.created'] },
  steps: [],
  ...overrides,
})

describe('PipelineService', () => {
  let service: PipelineService
  let prisma: {
    pipeline: {
      create: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
  }
  let redis: {
    get: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
    del: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    prisma = {
      pipeline: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    }
    redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined),
    }
    service = new PipelineService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      cacheKey,
      mockLogger,
    )
  })

  describe('create', () => {
    it('persists pipeline and invalidates workspace list cache', async () => {
      const created = makePipeline()
      prisma.pipeline.create.mockResolvedValue(created)

      const result = await service.create(WORKSPACE_ID, makeDto())

      expect(prisma.pipeline.create).toHaveBeenCalledOnce()
      expect(redis.del).toHaveBeenCalledWith(cacheKey.list(WORKSPACE_ID))
      expect(result.id).toBe(created.id)
    })

    it('defaults enabled to true when not supplied', async () => {
      prisma.pipeline.create.mockResolvedValue(makePipeline())
      await service.create(WORKSPACE_ID, makeDto())

      const callArgs = prisma.pipeline.create.mock.calls[0][0]
      expect(callArgs.data.enabled).toBe(true)
    })
  })

  describe('findAll', () => {
    it('returns cached value when available', async () => {
      const cached = [makePipeline()]
      redis.get.mockResolvedValue(JSON.stringify(cached))

      const result = await service.findAll(WORKSPACE_ID)

      expect(prisma.pipeline.findMany).not.toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })

    it('queries database and caches result on cache miss', async () => {
      const pipelines = [makePipeline(), makePipeline()]
      prisma.pipeline.findMany.mockResolvedValue(pipelines)

      const result = await service.findAll(WORKSPACE_ID)

      expect(prisma.pipeline.findMany).toHaveBeenCalledOnce()
      expect(redis.set).toHaveBeenCalledOnce()
      expect(result).toHaveLength(2)
    })
  })

  describe('findOne', () => {
    it('returns cached pipeline when available', async () => {
      const pipeline = makePipeline()
      redis.get.mockResolvedValue(JSON.stringify(pipeline))

      const result = await service.findOne(WORKSPACE_ID, pipeline.id)

      expect(prisma.pipeline.findFirst).not.toHaveBeenCalled()
      expect(result.id).toBe(pipeline.id)
    })

    it('queries database and caches on cache miss', async () => {
      const pipeline = makePipeline()
      prisma.pipeline.findFirst.mockResolvedValue(pipeline)

      const result = await service.findOne(WORKSPACE_ID, pipeline.id)

      expect(prisma.pipeline.findFirst).toHaveBeenCalledOnce()
      expect(redis.set).toHaveBeenCalledOnce()
      expect(result.id).toBe(pipeline.id)
    })

    it('throws NotFoundException when pipeline does not exist', async () => {
      prisma.pipeline.findFirst.mockResolvedValue(null)

      await expect(service.findOne(WORKSPACE_ID, randomUUID())).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('updates pipeline and invalidates both item and list cache', async () => {
      const pipeline = makePipeline()
      prisma.pipeline.findFirst.mockResolvedValue(pipeline)
      prisma.pipeline.update.mockResolvedValue({ ...pipeline, name: 'Updated' })

      const dto: UpdatePipelineDto = { name: 'Updated' }
      const result = await service.update(WORKSPACE_ID, pipeline.id, dto)

      expect(prisma.pipeline.update).toHaveBeenCalledOnce()
      expect(redis.del).toHaveBeenCalledWith(
        cacheKey.list(WORKSPACE_ID),
        cacheKey.one(pipeline.id, WORKSPACE_ID),
      )
      expect(result.name).toBe('Updated')
    })

    it('throws NotFoundException when pipeline does not exist', async () => {
      prisma.pipeline.findFirst.mockResolvedValue(null)

      await expect(
        service.update(WORKSPACE_ID, randomUUID(), { name: 'X' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('remove', () => {
    it('deletes pipeline and invalidates cache', async () => {
      const pipeline = makePipeline()
      prisma.pipeline.findFirst.mockResolvedValue(pipeline)
      prisma.pipeline.delete.mockResolvedValue(undefined)

      await service.remove(WORKSPACE_ID, pipeline.id)

      expect(prisma.pipeline.delete).toHaveBeenCalledWith({ where: { id: pipeline.id } })
      expect(redis.del).toHaveBeenCalled()
    })

    it('throws NotFoundException when pipeline does not exist', async () => {
      prisma.pipeline.findFirst.mockResolvedValue(null)

      await expect(service.remove(WORKSPACE_ID, randomUUID())).rejects.toThrow(NotFoundException)
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { NotFoundException } from '@nestjs/common'
import { ExecutionsService } from './executions.service'
import { PrismaService } from '../prisma/prisma.service'

const WORKSPACE_ID = randomUUID()
const PIPELINE_ID = randomUUID()

const makeExecution = (overrides = {}) => ({
  id: randomUUID(),
  workspaceId: WORKSPACE_ID,
  pipelineId: PIPELINE_ID,
  eventId: randomUUID(),
  messageId: randomUUID(),
  status: 'completed',
  startedAt: new Date(),
  completedAt: new Date(),
  error: null,
  ...overrides,
})

describe('ExecutionsService', () => {
  let service: ExecutionsService
  let prisma: {
    pipelineExecution: {
      findMany: ReturnType<typeof vi.fn>
      count: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    prisma = {
      pipelineExecution: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
      },
    }
    service = new ExecutionsService(prisma as unknown as PrismaService)
  })

  describe('findAll', () => {
    it('returns executions and total for workspace', async () => {
      const executions = [makeExecution(), makeExecution()]
      prisma.pipelineExecution.findMany.mockResolvedValue(executions)
      prisma.pipelineExecution.count.mockResolvedValue(2)

      const result = await service.findAll(WORKSPACE_ID, {})

      expect(result.executions).toBe(executions)
      expect(result.total).toBe(2)
      expect(result.limit).toBe(50)
      expect(result.offset).toBe(0)
      expect(prisma.pipelineExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: WORKSPACE_ID } }),
      )
    })

    it('filters by pipelineId when provided', async () => {
      prisma.pipelineExecution.findMany.mockResolvedValue([])
      prisma.pipelineExecution.count.mockResolvedValue(0)

      await service.findAll(WORKSPACE_ID, { pipelineId: PIPELINE_ID })

      expect(prisma.pipelineExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: WORKSPACE_ID, pipelineId: PIPELINE_ID } }),
      )
    })

    it('filters by status when provided', async () => {
      prisma.pipelineExecution.findMany.mockResolvedValue([])
      prisma.pipelineExecution.count.mockResolvedValue(0)

      await service.findAll(WORKSPACE_ID, { status: 'failed' })

      expect(prisma.pipelineExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: WORKSPACE_ID, status: 'failed' } }),
      )
    })

    it('respects limit and offset', async () => {
      prisma.pipelineExecution.findMany.mockResolvedValue([])
      prisma.pipelineExecution.count.mockResolvedValue(100)

      const result = await service.findAll(WORKSPACE_ID, { limit: 10, offset: 20 })

      expect(result.limit).toBe(10)
      expect(result.offset).toBe(20)
      expect(prisma.pipelineExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      )
    })
  })

  describe('findOne', () => {
    it('returns the execution when found', async () => {
      const execution = makeExecution()
      prisma.pipelineExecution.findFirst.mockResolvedValue(execution)

      const result = await service.findOne(WORKSPACE_ID, execution.id)

      expect(result).toBe(execution)
      expect(prisma.pipelineExecution.findFirst).toHaveBeenCalledWith({
        where: { id: execution.id, workspaceId: WORKSPACE_ID },
      })
    })

    it('throws NotFoundException when execution does not exist', async () => {
      prisma.pipelineExecution.findFirst.mockResolvedValue(null)

      await expect(service.findOne(WORKSPACE_ID, randomUUID())).rejects.toThrow(NotFoundException)
    })
  })
})

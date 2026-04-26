import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PipelineController } from './pipeline.controller'
import { PipelineService } from './pipeline.service'
import { CreatePipelineDto } from './dto/create-pipeline.dto'

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

const makeDto = (): CreatePipelineDto => ({
  name: 'My Pipeline',
  trigger: { type: 'event', events: ['order.created'] },
  steps: [],
})

describe('PipelineController', () => {
  let controller: PipelineController
  let service: {
    create: ReturnType<typeof vi.fn>
    findAll: ReturnType<typeof vi.fn>
    findOne: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    service = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    }
    controller = new PipelineController(service as unknown as PipelineService)
  })

  describe('create', () => {
    it('delegates to service with workspace id from header', async () => {
      const pipeline = makePipeline()
      service.create.mockResolvedValue(pipeline)

      const result = await controller.create(WORKSPACE_ID, makeDto())

      expect(service.create).toHaveBeenCalledWith(WORKSPACE_ID, makeDto())
      expect(result).toBe(pipeline)
    })

    it('throws BadRequestException when x-workspace-id header is missing', () => {
      expect(() => controller.create(undefined, makeDto())).toThrow(BadRequestException)
    })
  })

  describe('findAll', () => {
    it('returns pipelines for workspace', async () => {
      const pipelines = [makePipeline()]
      service.findAll.mockResolvedValue(pipelines)

      const result = await controller.findAll(WORKSPACE_ID)

      expect(service.findAll).toHaveBeenCalledWith(WORKSPACE_ID)
      expect(result).toBe(pipelines)
    })

    it('throws BadRequestException when x-workspace-id header is missing', () => {
      expect(() => controller.findAll(undefined)).toThrow(BadRequestException)
    })
  })

  describe('findOne', () => {
    it('returns pipeline by id', async () => {
      const pipeline = makePipeline()
      service.findOne.mockResolvedValue(pipeline)

      const result = await controller.findOne(WORKSPACE_ID, pipeline.id)

      expect(service.findOne).toHaveBeenCalledWith(WORKSPACE_ID, pipeline.id)
      expect(result).toBe(pipeline)
    })

    it('throws BadRequestException when x-workspace-id header is missing', () => {
      expect(() => controller.findOne(undefined, randomUUID())).toThrow(BadRequestException)
    })

    it('propagates NotFoundException from service', async () => {
      service.findOne.mockRejectedValue(new NotFoundException())

      await expect(controller.findOne(WORKSPACE_ID, randomUUID())).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('delegates update to service', async () => {
      const pipeline = makePipeline({ name: 'Updated' })
      service.update.mockResolvedValue(pipeline)

      const result = await controller.update(WORKSPACE_ID, pipeline.id, { name: 'Updated' })

      expect(service.update).toHaveBeenCalledWith(WORKSPACE_ID, pipeline.id, { name: 'Updated' })
      expect(result).toBe(pipeline)
    })
  })

  describe('remove', () => {
    it('delegates removal to service', async () => {
      service.remove.mockResolvedValue(undefined)
      const id = randomUUID()

      await controller.remove(WORKSPACE_ID, id)

      expect(service.remove).toHaveBeenCalledWith(WORKSPACE_ID, id)
    })
  })
})

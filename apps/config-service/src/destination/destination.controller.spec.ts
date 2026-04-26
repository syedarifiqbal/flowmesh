import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DestinationController } from './destination.controller'
import { DestinationService } from './destination.service'
import { CreateDestinationDto } from './dto/create-destination.dto'

const WORKSPACE_ID = randomUUID()

const makeDestination = (overrides = {}) => ({
  id: randomUUID(),
  workspaceId: WORKSPACE_ID,
  name: 'My Slack',
  type: 'slack',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeDto = (): CreateDestinationDto => ({
  name: 'My Slack',
  type: 'slack',
  config: { webhookUrl: 'https://hooks.slack.com/services/xxx' },
})

describe('DestinationController', () => {
  let controller: DestinationController
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
    controller = new DestinationController(service as unknown as DestinationService)
  })

  describe('create', () => {
    it('delegates to service with workspace id from header', async () => {
      const dest = makeDestination()
      service.create.mockResolvedValue(dest)

      const result = await controller.create(WORKSPACE_ID, makeDto())

      expect(service.create).toHaveBeenCalledWith(WORKSPACE_ID, makeDto())
      expect(result).toBe(dest)
    })

    it('throws BadRequestException when x-workspace-id header is missing', () => {
      expect(() => controller.create(undefined, makeDto())).toThrow(BadRequestException)
    })
  })

  describe('findAll', () => {
    it('returns destinations for workspace', async () => {
      const destinations = [makeDestination(), makeDestination()]
      service.findAll.mockResolvedValue(destinations)

      const result = await controller.findAll(WORKSPACE_ID)

      expect(service.findAll).toHaveBeenCalledWith(WORKSPACE_ID)
      expect(result).toBe(destinations)
    })

    it('throws BadRequestException when x-workspace-id header is missing', () => {
      expect(() => controller.findAll(undefined)).toThrow(BadRequestException)
    })
  })

  describe('findOne', () => {
    it('returns destination by id', async () => {
      const dest = makeDestination()
      service.findOne.mockResolvedValue(dest)

      const result = await controller.findOne(WORKSPACE_ID, dest.id)

      expect(service.findOne).toHaveBeenCalledWith(WORKSPACE_ID, dest.id)
      expect(result).toBe(dest)
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
      const dest = makeDestination({ name: 'Renamed' })
      service.update.mockResolvedValue(dest)

      const result = await controller.update(WORKSPACE_ID, dest.id, { name: 'Renamed' })

      expect(service.update).toHaveBeenCalledWith(WORKSPACE_ID, dest.id, { name: 'Renamed' })
      expect(result).toBe(dest)
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

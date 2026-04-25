import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { IngestionController } from './ingestion.controller'
import { IngestionService } from './ingestion.service'

const mockService = {
  ingest: vi.fn(),
  ingestBatch: vi.fn(),
}

const WORKSPACE_ID = randomUUID()

const makeEvent = () => ({
  event: 'order.created',
  correlationId: randomUUID(),
  source: 'order-service',
  version: '1.0',
  userId: 'user_123',
})

describe('IngestionController', () => {
  let controller: IngestionController

  beforeEach(async () => {
    vi.clearAllMocks()

    const module = await Test.createTestingModule({
      controllers: [IngestionController],
      providers: [{ provide: IngestionService, useValue: mockService }],
    }).compile()

    controller = module.get(IngestionController)
  })

  describe('POST /events', () => {
    it('returns 202 with eventId and accepted status', async () => {
      const eventId = randomUUID()
      mockService.ingest.mockResolvedValue({ eventId, status: 'accepted' })

      const result = await controller.ingest(makeEvent() as any, WORKSPACE_ID)
      expect(result).toEqual({ eventId, status: 'accepted' })
    })

    it('throws BadRequestException when x-workspace-id header is missing', async () => {
      await expect(
        controller.ingest(makeEvent() as any, undefined as any),
      ).rejects.toThrow(BadRequestException)
    })

    it('returns duplicate status without re-processing', async () => {
      const eventId = randomUUID()
      mockService.ingest.mockResolvedValue({ eventId, status: 'duplicate' })

      const result = await controller.ingest(makeEvent() as any, WORKSPACE_ID)
      expect(result.status).toBe('duplicate')
    })
  })

  describe('POST /events/batch', () => {
    it('returns accepted and duplicate counts', async () => {
      mockService.ingestBatch.mockResolvedValue([
        { eventId: randomUUID(), status: 'accepted' },
        { eventId: randomUUID(), status: 'duplicate' },
        { eventId: randomUUID(), status: 'accepted' },
      ])

      const result = await controller.ingestBatch(
        { events: [makeEvent(), makeEvent(), makeEvent()] as any },
        WORKSPACE_ID,
      )

      expect(result.accepted).toBe(2)
      expect(result.duplicates).toBe(1)
      expect(result.results).toHaveLength(3)
    })

    it('throws BadRequestException when x-workspace-id header is missing', async () => {
      await expect(
        controller.ingestBatch({ events: [makeEvent()] as any }, undefined as any),
      ).rejects.toThrow(BadRequestException)
    })
  })
})

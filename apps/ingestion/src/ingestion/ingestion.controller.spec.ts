import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { Test } from '@nestjs/testing'
import { IngestionController } from './ingestion.controller'
import { IngestionService } from './ingestion.service'

const mockService = {
  ingest: vi.fn(),
  ingestBatch: vi.fn(),
  identify: vi.fn(),
  alias: vi.fn(),
  findAll: vi.fn(),
  getThroughput: vi.fn(),
}

const WORKSPACE_ID = randomUUID()
const HEADER_CORRELATION_ID = randomUUID()

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

      const result = await controller.ingest(WORKSPACE_ID, HEADER_CORRELATION_ID, makeEvent() as any)
      expect(result).toEqual({ eventId, status: 'accepted' })
    })

    it('returns duplicate status without re-processing', async () => {
      const eventId = randomUUID()
      mockService.ingest.mockResolvedValue({ eventId, status: 'duplicate' })

      const result = await controller.ingest(WORKSPACE_ID, HEADER_CORRELATION_ID, makeEvent() as any)
      expect(result.status).toBe('duplicate')
    })

    it('uses header correlationId when body does not include one', async () => {
      const eventId = randomUUID()
      mockService.ingest.mockResolvedValue({ eventId, status: 'accepted' })

      const eventWithoutCorrelationId = { event: 'order.created', source: 'order-service', version: '1.0', userId: 'u1' }
      await controller.ingest(WORKSPACE_ID, HEADER_CORRELATION_ID, eventWithoutCorrelationId as any)

      expect(mockService.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: HEADER_CORRELATION_ID }),
        WORKSPACE_ID,
      )
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
        WORKSPACE_ID,
        HEADER_CORRELATION_ID,
        { events: [makeEvent(), makeEvent(), makeEvent()] as any },
      )

      expect(result.accepted).toBe(2)
      expect(result.duplicates).toBe(1)
      expect(result.results).toHaveLength(3)
    })
  })

  describe('POST /events/identify', () => {
    const makeIdentify = () => ({
      userId: 'user_123',
      source: 'demo-store',
      version: '1.0',
      traits: { name: 'Arif', email: 'arif@example.com' },
    })

    it('returns 202 with userId and created status for a new user', async () => {
      mockService.identify.mockResolvedValue({ userId: 'user_123', status: 'created' })

      const result = await controller.identify(WORKSPACE_ID, HEADER_CORRELATION_ID, makeIdentify() as any)
      expect(result).toEqual({ userId: 'user_123', status: 'created' })
    })

    it('returns updated status when user traits already exist', async () => {
      mockService.identify.mockResolvedValue({ userId: 'user_123', status: 'updated' })

      const result = await controller.identify(WORKSPACE_ID, HEADER_CORRELATION_ID, makeIdentify() as any)
      expect(result.status).toBe('updated')
    })

    it('uses header correlationId when body does not include one', async () => {
      mockService.identify.mockResolvedValue({ userId: 'user_123', status: 'created' })

      await controller.identify(WORKSPACE_ID, HEADER_CORRELATION_ID, makeIdentify() as any)

      expect(mockService.identify).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: HEADER_CORRELATION_ID }),
        WORKSPACE_ID,
      )
    })

    it('prefers body correlationId over header when both provided', async () => {
      const bodyCorrelationId = randomUUID()
      mockService.identify.mockResolvedValue({ userId: 'user_123', status: 'created' })

      await controller.identify(
        WORKSPACE_ID,
        HEADER_CORRELATION_ID,
        { ...makeIdentify(), correlationId: bodyCorrelationId } as any,
      )

      expect(mockService.identify).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: bodyCorrelationId }),
        WORKSPACE_ID,
      )
    })
  })

  describe('POST /events/alias', () => {
    const makeAlias = () => ({
      userId: 'user_123',
      anonymousId: 'anon_abc',
      source: 'demo-store',
      version: '1.0',
    })

    it('returns 202 with userId, anonymousId and created status', async () => {
      mockService.alias.mockResolvedValue({ userId: 'user_123', anonymousId: 'anon_abc', status: 'created' })

      const result = await controller.alias(WORKSPACE_ID, HEADER_CORRELATION_ID, makeAlias() as any)
      expect(result).toEqual({ userId: 'user_123', anonymousId: 'anon_abc', status: 'created' })
    })

    it('returns exists status when alias already recorded', async () => {
      mockService.alias.mockResolvedValue({ userId: 'user_123', anonymousId: 'anon_abc', status: 'exists' })

      const result = await controller.alias(WORKSPACE_ID, HEADER_CORRELATION_ID, makeAlias() as any)
      expect(result.status).toBe('exists')
    })

    it('uses header correlationId when body does not include one', async () => {
      mockService.alias.mockResolvedValue({ userId: 'user_123', anonymousId: 'anon_abc', status: 'created' })

      await controller.alias(WORKSPACE_ID, HEADER_CORRELATION_ID, makeAlias() as any)

      expect(mockService.alias).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: HEADER_CORRELATION_ID }),
        WORKSPACE_ID,
      )
    })
  })

  describe('GET /events/throughput', () => {
    it('returns buckets from the service', async () => {
      const buckets = [
        { time: '2026-05-10T12:00:00.000Z', count: 5 },
        { time: '2026-05-10T12:01:00.000Z', count: 3 },
      ]
      mockService.getThroughput.mockResolvedValue({ buckets })

      const result = await controller.getThroughput(WORKSPACE_ID, { range: '1h' })

      expect(result).toEqual({ buckets })
      expect(mockService.getThroughput).toHaveBeenCalledWith(WORKSPACE_ID, { range: '1h' })
    })

    it('returns empty buckets when no events in range', async () => {
      mockService.getThroughput.mockResolvedValue({ buckets: [] })

      const result = await controller.getThroughput(WORKSPACE_ID, { range: '7d' })

      expect(result).toEqual({ buckets: [] })
    })
  })
})

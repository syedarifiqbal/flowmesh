import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import { IngestionService } from './ingestion.service'
import { PrismaService } from '../prisma/prisma.service'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { RedisService } from '../redis/redis.service'
import { IngestEventDto } from './dto/ingest-event.dto'

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

const makeEvent = (overrides: Partial<IngestEventDto> = {}): IngestEventDto => ({
  event: 'order.created',
  correlationId: randomUUID(),
  source: 'order-service',
  version: '1.0',
  userId: 'user_123',
  properties: { orderId: 'ord_456', amount: 99.99 },
  ...overrides,
})

const WORKSPACE_ID = randomUUID()

describe('IngestionService', () => {
  let service: IngestionService
  let prisma: { event: { create: ReturnType<typeof vi.fn> } }
  let rabbitmq: { publish: ReturnType<typeof vi.fn> }
  let redis: {
    isEventProcessed: ReturnType<typeof vi.fn>
    markEventProcessed: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    prisma = { event: { create: vi.fn().mockResolvedValue({}) } }
    rabbitmq = { publish: vi.fn().mockResolvedValue(undefined) }
    redis = {
      isEventProcessed: vi.fn().mockResolvedValue(false),
      markEventProcessed: vi.fn().mockResolvedValue(undefined),
    }

    service = new IngestionService(
      prisma as unknown as PrismaService,
      rabbitmq as unknown as RabbitMQService,
      redis as unknown as RedisService,
      mockLogger,
    )
  })

  describe('ingest', () => {
    it('returns accepted status for a valid event', async () => {
      const result = await service.ingest(makeEvent(), WORKSPACE_ID)
      expect(result.status).toBe('accepted')
      expect(result.eventId).toBeDefined()
    })

    it('auto-generates eventId when not provided', async () => {
      const result = await service.ingest(makeEvent({ eventId: undefined }), WORKSPACE_ID)
      expect(result.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
    })

    it('uses provided eventId when given', async () => {
      const eventId = randomUUID()
      const result = await service.ingest(makeEvent({ eventId }), WORKSPACE_ID)
      expect(result.eventId).toBe(eventId)
    })

    it('returns duplicate status when eventId already processed', async () => {
      redis.isEventProcessed.mockResolvedValue(true)
      const result = await service.ingest(makeEvent(), WORKSPACE_ID)
      expect(result.status).toBe('duplicate')
    })

    it('does not persist or publish duplicate events', async () => {
      redis.isEventProcessed.mockResolvedValue(true)
      await service.ingest(makeEvent(), WORKSPACE_ID)
      expect(prisma.event.create).not.toHaveBeenCalled()
      expect(rabbitmq.publish).not.toHaveBeenCalled()
    })

    it('persists the event to the database', async () => {
      const event = makeEvent()
      await service.ingest(event, WORKSPACE_ID)
      expect(prisma.event.create).toHaveBeenCalledOnce()
      const call = prisma.event.create.mock.calls[0][0]
      expect(call.data.workspaceId).toBe(WORKSPACE_ID)
      expect(call.data.eventName).toBe('order.created')
      expect(call.data.correlationId).toBe(event.correlationId)
    })

    it('publishes message to RabbitMQ with correct envelope', async () => {
      const event = makeEvent()
      await service.ingest(event, WORKSPACE_ID)
      expect(rabbitmq.publish).toHaveBeenCalledOnce()
      const message = rabbitmq.publish.mock.calls[0][0]
      expect(message.meta.source).toBe('ingestion')
      expect(message.meta.correlationId).toBe(event.correlationId)
      expect(message.meta.workspaceId).toBe(WORKSPACE_ID)
      expect(message.payload.event).toBe('order.created')
    })

    it('marks event as processed in Redis after successful publish', async () => {
      const event = makeEvent({ eventId: randomUUID() })
      await service.ingest(event, WORKSPACE_ID)
      expect(redis.markEventProcessed).toHaveBeenCalledWith(event.eventId)
    })

    it('does not mark event processed if RabbitMQ publish fails', async () => {
      rabbitmq.publish.mockRejectedValue(new Error('RabbitMQ unavailable'))
      await expect(service.ingest(makeEvent(), WORKSPACE_ID)).rejects.toThrow()
      expect(redis.markEventProcessed).not.toHaveBeenCalled()
    })

    it('handles anonymousId when userId is absent', async () => {
      const event = makeEvent({ userId: undefined, anonymousId: 'anon_abc' })
      const result = await service.ingest(event, WORKSPACE_ID)
      expect(result.status).toBe('accepted')
      const call = prisma.event.create.mock.calls[0][0]
      expect(call.data.anonymousId).toBe('anon_abc')
      expect(call.data.userId).toBeNull()
    })
  })

  describe('ingestBatch', () => {
    it('processes all events in a batch', async () => {
      const events = [makeEvent(), makeEvent(), makeEvent()]
      const results = await service.ingestBatch(events, WORKSPACE_ID)
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.status === 'accepted')).toBe(true)
    })

    it('handles mixed accepted and duplicate events in a batch', async () => {
      redis.isEventProcessed
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      const events = [makeEvent(), makeEvent(), makeEvent()]
      const results = await service.ingestBatch(events, WORKSPACE_ID)
      const statuses = results.map((r) => r.status)
      expect(statuses).toEqual(['accepted', 'duplicate', 'accepted'])
    })
  })
})

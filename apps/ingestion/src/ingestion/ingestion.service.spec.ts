import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import { IngestionService } from './ingestion.service'
import { PrismaService } from '../prisma/prisma.service'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { RedisService } from '../redis/redis.service'
import { RedisPubSubService } from '../redis/redis-pubsub.service'
import { IngestEventDto } from './dto/ingest-event.dto'
import { IdentifyDto } from './dto/identify.dto'
import { ThroughputQueryDto } from './dto/throughput-query.dto'

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

const makeEvent = (overrides: Partial<IngestEventDto> = {}): IngestEventDto & { correlationId: string } => ({
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
  let prisma: {
    event: { create: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
    userTrait: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
    $queryRaw: ReturnType<typeof vi.fn>
  }
  let rabbitmq: { publish: ReturnType<typeof vi.fn> }
  let redis: {
    isEventProcessed: ReturnType<typeof vi.fn>
    markEventProcessed: ReturnType<typeof vi.fn>
  }
  let pubsub: { publishEvent: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    prisma = {
      event: { create: vi.fn().mockResolvedValue({}), count: vi.fn(), findMany: vi.fn() },
      userTrait: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      $queryRaw: vi.fn(),
    }
    rabbitmq = { publish: vi.fn().mockResolvedValue(undefined) }
    redis = {
      isEventProcessed: vi.fn().mockResolvedValue(false),
      markEventProcessed: vi.fn().mockResolvedValue(undefined),
    }
    pubsub = { publishEvent: vi.fn().mockResolvedValue(undefined) }

    service = new IngestionService(
      prisma as unknown as PrismaService,
      rabbitmq as unknown as RabbitMQService,
      redis as unknown as RedisService,
      pubsub as unknown as RedisPubSubService,
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

  describe('identify', () => {
    const makeIdentify = (overrides: Partial<IdentifyDto> = {}): IdentifyDto & { correlationId: string } => ({
      userId: 'user_123',
      source: 'demo-store',
      version: '1.0',
      correlationId: randomUUID(),
      traits: { name: 'Arif', email: 'arif@example.com' },
      ...overrides,
    })

    it('returns created status when user does not exist yet', async () => {
      prisma.userTrait.findUnique.mockResolvedValue(null)
      const result = await service.identify(makeIdentify(), WORKSPACE_ID)
      expect(result).toEqual({ userId: 'user_123', status: 'created' })
    })

    it('returns updated status when user traits already exist', async () => {
      prisma.userTrait.findUnique.mockResolvedValue({ id: randomUUID() })
      const result = await service.identify(makeIdentify(), WORKSPACE_ID)
      expect(result).toEqual({ userId: 'user_123', status: 'updated' })
    })

    it('upserts user traits in the database', async () => {
      const identify = makeIdentify()
      await service.identify(identify, WORKSPACE_ID)
      expect(prisma.userTrait.upsert).toHaveBeenCalledOnce()
      const call = prisma.userTrait.upsert.mock.calls[0][0]
      expect(call.where).toEqual({ workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: 'user_123' } })
      expect(call.create.traits).toEqual(identify.traits)
      expect(call.update.traits).toEqual(identify.traits)
    })

    it('publishes user.identified event to RabbitMQ pipeline', async () => {
      const identify = makeIdentify()
      await service.identify(identify, WORKSPACE_ID)
      expect(rabbitmq.publish).toHaveBeenCalledOnce()
      const message = rabbitmq.publish.mock.calls[0][0]
      expect(message.payload.event).toBe('user.identified')
      expect(message.payload.userId).toBe('user_123')
      expect(message.meta.workspaceId).toBe(WORKSPACE_ID)
    })

    it('publishes to live event feed with event name user.identified', async () => {
      await service.identify(makeIdentify(), WORKSPACE_ID)
      expect(pubsub.publishEvent).toHaveBeenCalledOnce()
      const call = pubsub.publishEvent.mock.calls[0][0]
      expect(call.eventName).toBe('user.identified')
      expect(call.userId).toBe('user_123')
    })

    it('stores anonymousId when provided', async () => {
      await service.identify(makeIdentify({ anonymousId: 'anon_xyz' }), WORKSPACE_ID)
      const call = prisma.userTrait.upsert.mock.calls[0][0]
      expect(call.create.anonymousId).toBe('anon_xyz')
    })

    it('stores empty traits object when traits are omitted', async () => {
      await service.identify(makeIdentify({ traits: undefined }), WORKSPACE_ID)
      const call = prisma.userTrait.upsert.mock.calls[0][0]
      expect(call.create.traits).toEqual({})
    })
  })

  describe('getThroughput', () => {
    const makeQuery = (range?: ThroughputQueryDto['range']): ThroughputQueryDto => ({ range })

    it('returns buckets with time and count for 1h range', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { time: new Date('2026-05-10T12:00:00Z'), count: BigInt(5) },
        { time: new Date('2026-05-10T12:01:00Z'), count: BigInt(3) },
      ])

      const result = await service.getThroughput(WORKSPACE_ID, makeQuery('1h'))

      expect(result.buckets).toHaveLength(2)
      expect(result.buckets[0]).toEqual({ time: '2026-05-10T12:00:00.000Z', count: 5 })
      expect(result.buckets[1]).toEqual({ time: '2026-05-10T12:01:00.000Z', count: 3 })
    })

    it('returns empty buckets when no events exist', async () => {
      prisma.$queryRaw.mockResolvedValue([])

      const result = await service.getThroughput(WORKSPACE_ID, makeQuery('24h'))

      expect(result.buckets).toEqual([])
    })

    it('defaults to 1h range when range is undefined', async () => {
      prisma.$queryRaw.mockResolvedValue([])

      await service.getThroughput(WORKSPACE_ID, makeQuery(undefined))

      expect(prisma.$queryRaw).toHaveBeenCalledOnce()
    })

    it('converts BigInt counts to plain numbers', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { time: new Date('2026-05-10T00:00:00Z'), count: BigInt(1000) },
      ])

      const result = await service.getThroughput(WORKSPACE_ID, makeQuery('7d'))

      expect(typeof result.buckets[0].count).toBe('number')
      expect(result.buckets[0].count).toBe(1000)
    })
  })
})

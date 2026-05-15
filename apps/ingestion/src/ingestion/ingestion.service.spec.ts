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
import { AliasDto } from './dto/alias.dto'
import { PageDto } from './dto/page.dto'
import { GroupDto } from './dto/group.dto'
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
    aliasMap: {
      findUnique: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
    }
    groupTrait: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
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
      aliasMap: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
      },
      groupTrait: {
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

  describe('alias', () => {
    const makeAlias = (overrides: Partial<AliasDto> = {}): AliasDto & { correlationId: string } => ({
      userId: 'user_123',
      anonymousId: 'anon_abc',
      source: 'demo-store',
      version: '1.0',
      correlationId: randomUUID(),
      ...overrides,
    })

    it('returns created status when alias does not exist yet', async () => {
      prisma.aliasMap.findUnique.mockResolvedValue(null)
      const result = await service.alias(makeAlias(), WORKSPACE_ID)
      expect(result).toEqual({ userId: 'user_123', anonymousId: 'anon_abc', status: 'created' })
    })

    it('returns exists status when alias already recorded', async () => {
      prisma.aliasMap.findUnique.mockResolvedValue({ id: randomUUID() })
      const result = await service.alias(makeAlias(), WORKSPACE_ID)
      expect(result.status).toBe('exists')
    })

    it('does not create a duplicate alias record when alias already exists', async () => {
      prisma.aliasMap.findUnique.mockResolvedValue({ id: randomUUID() })
      await service.alias(makeAlias(), WORKSPACE_ID)
      expect(prisma.aliasMap.create).not.toHaveBeenCalled()
    })

    it('persists the alias mapping to the database', async () => {
      const alias = makeAlias()
      await service.alias(alias, WORKSPACE_ID)
      expect(prisma.aliasMap.create).toHaveBeenCalledOnce()
      const call = prisma.aliasMap.create.mock.calls[0][0]
      expect(call.data.workspaceId).toBe(WORKSPACE_ID)
      expect(call.data.userId).toBe('user_123')
      expect(call.data.anonymousId).toBe('anon_abc')
    })

    it('publishes user.aliased event to RabbitMQ pipeline', async () => {
      const alias = makeAlias()
      await service.alias(alias, WORKSPACE_ID)
      expect(rabbitmq.publish).toHaveBeenCalledOnce()
      const message = rabbitmq.publish.mock.calls[0][0]
      expect(message.payload.event).toBe('user.aliased')
      expect(message.payload.userId).toBe('user_123')
      expect(message.payload.anonymousId).toBe('anon_abc')
    })

    it('publishes to live event feed with event name user.aliased', async () => {
      await service.alias(makeAlias(), WORKSPACE_ID)
      expect(pubsub.publishEvent).toHaveBeenCalledOnce()
      const call = pubsub.publishEvent.mock.calls[0][0]
      expect(call.eventName).toBe('user.aliased')
      expect(call.userId).toBe('user_123')
      expect(call.anonymousId).toBe('anon_abc')
    })
  })

  describe('page', () => {
    const makePage = (overrides: Partial<PageDto> = {}): PageDto & { correlationId: string } => ({
      name: 'Home',
      url: 'https://example.com/',
      source: 'web',
      version: '1.0',
      userId: 'user_123',
      correlationId: randomUUID(),
      ...overrides,
    })

    it('returns accepted status for a valid page call', async () => {
      const result = await service.page(makePage(), WORKSPACE_ID)
      expect(result.status).toBe('accepted')
    })

    it('stores event name as page.viewed', async () => {
      await service.page(makePage(), WORKSPACE_ID)
      const call = prisma.event.create.mock.calls[0][0]
      expect(call.data.eventName).toBe('page.viewed')
    })

    it('stores name and url in properties', async () => {
      await service.page(makePage({ name: 'Checkout', url: 'https://example.com/checkout' }), WORKSPACE_ID)
      const call = prisma.event.create.mock.calls[0][0]
      expect(call.data.properties).toMatchObject({ name: 'Checkout', url: 'https://example.com/checkout' })
    })

    it('stores name in properties when url is omitted', async () => {
      await service.page(makePage({ url: undefined }), WORKSPACE_ID)
      const call = prisma.event.create.mock.calls[0][0]
      expect(call.data.properties).toEqual({ name: 'Home' })
    })

    it('publishes page.viewed to RabbitMQ pipeline', async () => {
      await service.page(makePage(), WORKSPACE_ID)
      const message = rabbitmq.publish.mock.calls[0][0]
      expect(message.payload.event).toBe('page.viewed')
    })

    it('returns duplicate when same eventId submitted twice', async () => {
      redis.isEventProcessed.mockResolvedValue(true)
      const result = await service.page(makePage({ eventId: randomUUID() }), WORKSPACE_ID)
      expect(result.status).toBe('duplicate')
    })
  })

  describe('group', () => {
    const makeGroup = (overrides: Partial<GroupDto> = {}): GroupDto & { correlationId: string } => ({
      groupId: 'acme-corp',
      userId: 'user_123',
      source: 'demo-store',
      version: '1.0',
      correlationId: randomUUID(),
      traits: { name: 'Acme Corp', plan: 'enterprise' },
      ...overrides,
    })

    it('returns created status when group membership does not exist yet', async () => {
      prisma.groupTrait.findUnique.mockResolvedValue(null)
      const result = await service.group(makeGroup(), WORKSPACE_ID)
      expect(result).toEqual({ groupId: 'acme-corp', userId: 'user_123', status: 'created' })
    })

    it('returns updated status when group membership already exists', async () => {
      prisma.groupTrait.findUnique.mockResolvedValue({ id: randomUUID() })
      const result = await service.group(makeGroup(), WORKSPACE_ID)
      expect(result.status).toBe('updated')
    })

    it('upserts group traits in the database', async () => {
      const group = makeGroup()
      await service.group(group, WORKSPACE_ID)
      expect(prisma.groupTrait.upsert).toHaveBeenCalledOnce()
      const call = prisma.groupTrait.upsert.mock.calls[0][0]
      expect(call.where).toEqual({ workspaceId_groupId_userId: { workspaceId: WORKSPACE_ID, groupId: 'acme-corp', userId: 'user_123' } })
      expect(call.create.traits).toEqual(group.traits)
      expect(call.update.traits).toEqual(group.traits)
    })

    it('publishes group.identified event to RabbitMQ pipeline', async () => {
      await service.group(makeGroup(), WORKSPACE_ID)
      expect(rabbitmq.publish).toHaveBeenCalledOnce()
      const message = rabbitmq.publish.mock.calls[0][0]
      expect(message.payload.event).toBe('group.identified')
      expect(message.payload.userId).toBe('user_123')
      expect(message.meta.workspaceId).toBe(WORKSPACE_ID)
    })

    it('publishes group.identified to live event feed', async () => {
      await service.group(makeGroup(), WORKSPACE_ID)
      const call = pubsub.publishEvent.mock.calls[0][0]
      expect(call.eventName).toBe('group.identified')
      expect(call.userId).toBe('user_123')
    })

    it('stores empty traits object when traits are omitted', async () => {
      await service.group(makeGroup({ traits: undefined }), WORKSPACE_ID)
      const call = prisma.groupTrait.upsert.mock.calls[0][0]
      expect(call.create.traits).toEqual({})
    })
  })

  describe('findAll', () => {
    beforeEach(() => {
      prisma.event.findMany.mockResolvedValue([])
      prisma.event.count.mockResolvedValue(0)
    })

    it('returns events and total count', async () => {
      const fakeEvent = { id: '1', eventId: randomUUID(), eventName: 'order.created', source: 'server', version: '1.0', correlationId: randomUUID(), userId: 'user_123', anonymousId: null, properties: {}, receivedAt: new Date() }
      prisma.event.findMany.mockResolvedValue([fakeEvent])
      prisma.event.count.mockResolvedValue(1)

      const result = await service.findAll(WORKSPACE_ID, {})
      expect(result.total).toBe(1)
      expect(result.events).toHaveLength(1)
      expect(result.limit).toBe(50)
      expect(result.offset).toBe(0)
    })

    it('filters by event name when event param provided', async () => {
      await service.findAll(WORKSPACE_ID, { event: 'order.created' })
      const where = prisma.event.findMany.mock.calls[0][0].where
      expect(where.AND).toContainEqual({ eventName: 'order.created' })
    })

    it('filters by source when source param provided', async () => {
      await service.findAll(WORKSPACE_ID, { source: 'web' })
      const where = prisma.event.findMany.mock.calls[0][0].where
      expect(where.AND).toContainEqual({ source: 'web' })
    })

    it('filters by userId directly when no alias mapping exists', async () => {
      prisma.aliasMap.findMany.mockResolvedValue([])
      await service.findAll(WORKSPACE_ID, { userId: 'user_123' })
      const where = prisma.event.findMany.mock.calls[0][0].where
      expect(where.AND).toContainEqual({ userId: 'user_123' })
    })

    it('filters by anonymousId directly when no alias mapping exists', async () => {
      prisma.aliasMap.findUnique.mockResolvedValue(null)
      await service.findAll(WORKSPACE_ID, { anonymousId: 'anon_abc' })
      const where = prisma.event.findMany.mock.calls[0][0].where
      expect(where.AND).toContainEqual({ anonymousId: 'anon_abc' })
    })

    describe('identity stitching', () => {
      it('expands userId filter to include pre-login events for linked anonymousIds', async () => {
        prisma.aliasMap.findMany.mockResolvedValue([{ anonymousId: 'anon_abc' }])
        await service.findAll(WORKSPACE_ID, { userId: 'user_123' })

        const and = prisma.event.findMany.mock.calls[0][0].where.AND as unknown[]
        const stitched = and.find((c) => typeof c === 'object' && 'OR' in (c as object)) as { OR: unknown[] }
        expect(stitched.OR).toContainEqual({ userId: 'user_123' })
        expect(stitched.OR).toContainEqual({ anonymousId: { in: ['anon_abc'] } })
      })

      it('expands anonymousId filter to include post-login events for linked userId', async () => {
        prisma.aliasMap.findUnique.mockResolvedValue({ userId: 'user_123' })
        await service.findAll(WORKSPACE_ID, { anonymousId: 'anon_abc' })

        const and = prisma.event.findMany.mock.calls[0][0].where.AND as unknown[]
        const stitched = and.find((c) => typeof c === 'object' && 'OR' in (c as object)) as { OR: unknown[] }
        expect(stitched.OR).toContainEqual({ anonymousId: 'anon_abc' })
        expect(stitched.OR).toContainEqual({ userId: 'user_123' })
      })

      it('includes all anonymousIds when a userId has multiple alias mappings', async () => {
        prisma.aliasMap.findMany.mockResolvedValue([
          { anonymousId: 'anon_device1' },
          { anonymousId: 'anon_device2' },
        ])
        await service.findAll(WORKSPACE_ID, { userId: 'user_123' })

        const and = prisma.event.findMany.mock.calls[0][0].where.AND as unknown[]
        const stitched = and.find((c) => typeof c === 'object' && 'OR' in (c as object)) as { OR: unknown[] }
        expect(stitched.OR).toContainEqual({ anonymousId: { in: ['anon_device1', 'anon_device2'] } })
      })

      it('looks up alias mapping scoped to the correct workspaceId', async () => {
        await service.findAll(WORKSPACE_ID, { userId: 'user_123' })
        expect(prisma.aliasMap.findMany).toHaveBeenCalledWith({
          where: { workspaceId: WORKSPACE_ID, userId: 'user_123' },
          select: { anonymousId: true },
        })
      })

      it('looks up alias mapping scoped to the correct workspaceId for anonymousId filter', async () => {
        await service.findAll(WORKSPACE_ID, { anonymousId: 'anon_abc' })
        expect(prisma.aliasMap.findUnique).toHaveBeenCalledWith({
          where: { workspaceId_anonymousId: { workspaceId: WORKSPACE_ID, anonymousId: 'anon_abc' } },
          select: { userId: true },
        })
      })
    })

    it('applies case-insensitive search across eventName, source, and correlationId', async () => {
      await service.findAll(WORKSPACE_ID, { search: 'checkout' })
      const and = prisma.event.findMany.mock.calls[0][0].where.AND
      const searchClause = and.find((c: { OR?: unknown }) => c.OR)
      expect(searchClause.OR).toContainEqual({ eventName: { contains: 'checkout', mode: 'insensitive' } })
      expect(searchClause.OR).toContainEqual({ source: { contains: 'checkout', mode: 'insensitive' } })
      expect(searchClause.OR).toContainEqual({ correlationId: { contains: 'checkout', mode: 'insensitive' } })
    })

    it('respects limit and offset from query params', async () => {
      await service.findAll(WORKSPACE_ID, { limit: 10, offset: 20 })
      const call = prisma.event.findMany.mock.calls[0][0]
      expect(call.take).toBe(10)
      expect(call.skip).toBe(20)
    })

    it('returns limit and offset in the response', async () => {
      const result = await service.findAll(WORKSPACE_ID, { limit: 25, offset: 50 })
      expect(result.limit).toBe(25)
      expect(result.offset).toBe(50)
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

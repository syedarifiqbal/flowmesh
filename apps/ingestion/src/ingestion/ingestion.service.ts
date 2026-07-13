import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Prisma } from '../generated/prisma'
import { PrismaService } from '../prisma/prisma.service'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { RedisService } from '../redis/redis.service'
import { RedisPubSubService } from '../redis/redis-pubsub.service'
import { IngestEventDto } from './dto/ingest-event.dto'
import { IdentifyDto } from './dto/identify.dto'
import { AliasDto } from './dto/alias.dto'
import { PageDto } from './dto/page.dto'
import { GroupDto } from './dto/group.dto'
import { QueryEventsDto } from './dto/query-events.dto'
import { ThroughputQueryDto } from './dto/throughput-query.dto'

export interface ThroughputBucket {
  time: string
  count: number
}

export interface UserProfile {
  userId: string
  traits: Record<string, unknown>
  anonymousIds: { anonymousId: string; linkedAt: string }[]
  groups: { groupId: string; traits: Record<string, unknown>; joinedAt: string }[]
  eventCount: number
  firstSeen: string | null
  lastSeen: string | null
}

const RANGE_CONFIG = {
  '1h':  { interval: "1 hour",   trunc: 'minute', buckets: 60 },
  '24h': { interval: "24 hours", trunc: 'hour',   buckets: 24 },
  '7d':  { interval: "7 days",   trunc: 'hour',   buckets: 168 },
} as const

export interface IngestResult {
  eventId: string
  status: 'accepted' | 'duplicate'
}

export interface IdentifyResult {
  userId: string
  status: 'created' | 'updated'
}

export interface AliasResult {
  userId: string
  anonymousId: string
  status: 'created' | 'exists'
}

export interface GroupResult {
  groupId: string
  userId: string
  status: 'created' | 'updated'
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
    private readonly redis: RedisService,
    private readonly pubsub: RedisPubSubService,
    @InjectPinoLogger(IngestionService.name) private readonly logger: PinoLogger,
  ) {}

  async findAll(workspaceId: string, query: QueryEventsDto) {
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0

    const and: Prisma.EventWhereInput[] = [{ workspaceId }]
    if (query.event) and.push({ eventName: query.event })
    if (query.source) and.push({ source: query.source })

    if (query.userId) {
      // Identity stitching — include pre-login events for all anonymousIds linked to this userId
      const aliases = await this.prisma.aliasMap.findMany({
        where: { workspaceId, userId: query.userId },
        select: { anonymousId: true },
      })
      const linkedAnonIds = aliases.map((a) => a.anonymousId)
      and.push(
        linkedAnonIds.length > 0
          ? { OR: [{ userId: query.userId }, { anonymousId: { in: linkedAnonIds } }] }
          : { userId: query.userId },
      )
    }

    if (query.anonymousId) {
      // Identity stitching — include post-login events for the userId this anonymousId was aliased to
      const alias = await this.prisma.aliasMap.findUnique({
        where: { workspaceId_anonymousId: { workspaceId, anonymousId: query.anonymousId } },
        select: { userId: true },
      })
      and.push(
        alias
          ? { OR: [{ anonymousId: query.anonymousId }, { userId: alias.userId }] }
          : { anonymousId: query.anonymousId },
      )
    }

    if (query.search) {
      and.push({
        OR: [
          { eventName: { contains: query.search, mode: 'insensitive' } },
          { source: { contains: query.search, mode: 'insensitive' } },
          { correlationId: { contains: query.search, mode: 'insensitive' } },
        ],
      })
    }
    const where: Prisma.EventWhereInput = { AND: and }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { [query.sortBy ?? 'receivedAt']: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          eventId: true,
          correlationId: true,
          eventName: true,
          source: true,
          version: true,
          userId: true,
          anonymousId: true,
          properties: true,
          receivedAt: true,
        },
      }),
      this.prisma.event.count({ where }),
    ])

    return { events, total, limit, offset }
  }

  async ingest(dto: IngestEventDto & { correlationId: string }, workspaceId: string): Promise<IngestResult> {
    const eventId = dto.eventId ?? randomUUID()
    const timestamp = dto.timestamp ?? new Date().toISOString()

    // Idempotency check — skip if already processed
    const isDuplicate = await this.redis.isEventProcessed(eventId)
    if (isDuplicate) {
      this.logger.debug({ eventId, correlationId: dto.correlationId }, 'duplicate event skipped')
      return { eventId, status: 'duplicate' }
    }

    // Persist raw event
    await this.prisma.event.create({
      data: {
        workspaceId,
        eventId,
        correlationId: dto.correlationId,
        eventName: dto.event,
        source: dto.source,
        version: dto.version,
        userId: dto.userId ?? null,
        anonymousId: dto.anonymousId ?? null,
        sessionId: dto.sessionId ?? null,
        properties: (dto.properties ?? {}) as object,
        context: (dto.context ?? {}) as object,
        receivedAt: new Date(),
      },
    })

    await this.publishToQueue(dto.correlationId, workspaceId, {
      eventId, event: dto.event, source: dto.source, version: dto.version,
      userId: dto.userId, anonymousId: dto.anonymousId, sessionId: dto.sessionId,
      properties: dto.properties ?? {}, context: dto.context ?? {}, receivedAt: timestamp,
    })

    // Mark as processed after successful publish
    await this.redis.markEventProcessed(eventId)

    this.publishToLiveFeed({ eventId, eventName: dto.event, source: dto.source, userId: dto.userId ?? null, anonymousId: dto.anonymousId ?? null, correlationId: dto.correlationId, properties: dto.properties ?? {}, receivedAt: timestamp, workspaceId })

    this.logger.info({ eventId, correlationId: dto.correlationId, workspaceId, event: dto.event }, 'event accepted')

    return { eventId, status: 'accepted' }
  }

  async alias(
    dto: AliasDto & { correlationId: string },
    workspaceId: string,
  ): Promise<AliasResult> {
    const eventId = dto.eventId ?? randomUUID()
    const timestamp = dto.timestamp ?? new Date().toISOString()

    const existing = await this.prisma.aliasMap.findUnique({
      where: { workspaceId_anonymousId: { workspaceId, anonymousId: dto.anonymousId } },
      select: { id: true },
    })

    if (!existing) {
      await this.prisma.aliasMap.create({
        data: {
          workspaceId,
          anonymousId: dto.anonymousId,
          userId: dto.userId,
          source: dto.source,
          version: dto.version,
        },
      })
    }

    const isDuplicate = await this.redis.isEventProcessed(eventId)
    if (!isDuplicate) {
      await this.prisma.event.create({
        data: {
          workspaceId,
          eventId,
          correlationId: dto.correlationId,
          eventName: 'user.aliased',
          source: dto.source,
          version: dto.version,
          userId: dto.userId ?? null,
          anonymousId: dto.anonymousId ?? null,
          sessionId: null,
          properties: { anonymousId: dto.anonymousId } as object,
          context: {} as object,
          receivedAt: new Date(),
        },
      })
      await this.redis.markEventProcessed(eventId)
    }

    await this.publishToQueue(dto.correlationId, workspaceId, {
      eventId, event: 'user.aliased', source: dto.source, version: dto.version,
      userId: dto.userId, anonymousId: dto.anonymousId, properties: { anonymousId: dto.anonymousId }, context: {}, receivedAt: timestamp,
    })
    this.publishToLiveFeed({ eventId, eventName: 'user.aliased', source: dto.source, userId: dto.userId, anonymousId: dto.anonymousId, correlationId: dto.correlationId, properties: { anonymousId: dto.anonymousId }, receivedAt: timestamp, workspaceId })

    this.logger.info(
      { userId: dto.userId, anonymousId: dto.anonymousId, workspaceId, correlationId: dto.correlationId },
      'alias created',
    )

    return { userId: dto.userId, anonymousId: dto.anonymousId, status: existing ? 'exists' : 'created' }
  }

  async ingestBatch(
    events: (IngestEventDto & { correlationId: string })[],
    workspaceId: string,
  ): Promise<IngestResult[]> {
    return Promise.all(events.map((event) => this.ingest(event, workspaceId)))
  }

  async identify(
    dto: IdentifyDto & { correlationId: string },
    workspaceId: string,
  ): Promise<IdentifyResult> {
    const eventId = dto.eventId ?? randomUUID()
    const timestamp = dto.timestamp ?? new Date().toISOString()

    const status = await this.upsertTraits({
      find: () => this.prisma.userTrait.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: dto.userId } },
        select: { id: true },
      }),
      upsert: () => this.prisma.userTrait.upsert({
        where: { workspaceId_userId: { workspaceId, userId: dto.userId } },
        create: { workspaceId, userId: dto.userId, anonymousId: dto.anonymousId ?? null, traits: (dto.traits ?? {}) as object, source: dto.source, version: dto.version },
        update: { anonymousId: dto.anonymousId ?? null, traits: (dto.traits ?? {}) as object, source: dto.source, version: dto.version },
      }),
    })

    const isDuplicate = await this.redis.isEventProcessed(eventId)
    if (!isDuplicate) {
      await this.prisma.event.create({
        data: {
          workspaceId,
          eventId,
          correlationId: dto.correlationId,
          eventName: 'user.identified',
          source: dto.source,
          version: dto.version,
          userId: dto.userId ?? null,
          anonymousId: dto.anonymousId ?? null,
          sessionId: null,
          properties: (dto.traits ?? {}) as object,
          context: (dto.context ?? {}) as object,
          receivedAt: new Date(),
        },
      })
      await this.redis.markEventProcessed(eventId)
    }

    await this.publishToQueue(dto.correlationId, workspaceId, {
      eventId, event: 'user.identified', source: dto.source, version: dto.version,
      userId: dto.userId, anonymousId: dto.anonymousId, properties: dto.traits ?? {}, context: dto.context ?? {}, receivedAt: timestamp,
    })
    this.publishToLiveFeed({ eventId, eventName: 'user.identified', source: dto.source, userId: dto.userId, anonymousId: dto.anonymousId ?? null, correlationId: dto.correlationId, properties: dto.traits ?? {}, receivedAt: timestamp, workspaceId })
    this.logger.info({ userId: dto.userId, workspaceId, correlationId: dto.correlationId }, 'user identified')
    return { userId: dto.userId, status }
  }

  async page(
    dto: PageDto & { correlationId: string },
    workspaceId: string,
  ): Promise<IngestResult> {
    return this.ingest(
      {
        ...dto,
        event: 'page.viewed',
        properties: { name: dto.name, ...(dto.url ? { url: dto.url } : {}) },
      },
      workspaceId,
    )
  }

  async group(
    dto: GroupDto & { correlationId: string },
    workspaceId: string,
  ): Promise<GroupResult> {
    const eventId = dto.eventId ?? randomUUID()
    const timestamp = dto.timestamp ?? new Date().toISOString()

    const status = await this.upsertTraits({
      find: () => this.prisma.groupTrait.findUnique({
        where: { workspaceId_groupId_userId: { workspaceId, groupId: dto.groupId, userId: dto.userId } },
        select: { id: true },
      }),
      upsert: () => this.prisma.groupTrait.upsert({
        where: { workspaceId_groupId_userId: { workspaceId, groupId: dto.groupId, userId: dto.userId } },
        create: { workspaceId, groupId: dto.groupId, userId: dto.userId, traits: (dto.traits ?? {}) as object, source: dto.source, version: dto.version },
        update: { traits: (dto.traits ?? {}) as object, source: dto.source, version: dto.version },
      }),
    })

    const isDuplicate = await this.redis.isEventProcessed(eventId)
    if (!isDuplicate) {
      await this.prisma.event.create({
        data: {
          workspaceId,
          eventId,
          correlationId: dto.correlationId,
          eventName: 'group.identified',
          source: dto.source,
          version: dto.version,
          userId: dto.userId ?? null,
          anonymousId: null,
          sessionId: null,
          properties: { groupId: dto.groupId, ...(dto.traits ?? {}) } as object,
          context: (dto.context ?? {}) as object,
          receivedAt: new Date(),
        },
      })
      await this.redis.markEventProcessed(eventId)
    }

    await this.publishToQueue(dto.correlationId, workspaceId, {
      eventId, event: 'group.identified', source: dto.source, version: dto.version,
      userId: dto.userId, properties: { groupId: dto.groupId, ...(dto.traits ?? {}) }, context: dto.context ?? {}, receivedAt: timestamp,
    })
    this.publishToLiveFeed({ eventId, eventName: 'group.identified', source: dto.source, userId: dto.userId, anonymousId: null, correlationId: dto.correlationId, properties: { groupId: dto.groupId, ...(dto.traits ?? {}) }, receivedAt: timestamp, workspaceId })
    this.logger.info({ groupId: dto.groupId, userId: dto.userId, workspaceId, correlationId: dto.correlationId }, 'group identified')
    return { groupId: dto.groupId, userId: dto.userId, status }
  }

  // Shared helper — both identify() and group() follow the same find→upsert→status pattern
  private async upsertTraits(ops: {
    find: () => Promise<{ id: string } | null>
    upsert: () => Promise<unknown>
  }): Promise<'created' | 'updated'> {
    const existing = await ops.find()
    await ops.upsert()
    return existing ? 'updated' : 'created'
  }

  // Shared helper — publish a payload to the pipeline exchange
  private publishToQueue(
    correlationId: string,
    workspaceId: string,
    payload: Record<string, unknown>,
  ) {
    return this.rabbitmq.publish({
      meta: { messageId: randomUUID(), correlationId, timestamp: new Date().toISOString(), source: 'ingestion', version: '1.0', workspaceId },
      payload,
    })
  }

  // Shared helper — fire-and-forget publish to Redis pub/sub live feed
  private publishToLiveFeed(event: {
    eventId: string; eventName: string; source: string
    userId?: string | null; anonymousId: string | null; correlationId: string
    properties: Record<string, unknown>; receivedAt: string; workspaceId: string
  }) {
    this.pubsub.publishEvent({
      id: event.eventId, eventId: event.eventId, eventName: event.eventName,
      source: event.source, userId: event.userId ?? null, anonymousId: event.anonymousId,
      correlationId: event.correlationId, properties: event.properties,
      receivedAt: event.receivedAt, workspaceId: event.workspaceId,
    }).catch((err) => this.logger.warn({ err }, 'live event publish failed — non-critical'))
  }

  async getUserProfile(userId: string, workspaceId: string): Promise<UserProfile> {
    const [traits, aliases, groups] = await Promise.all([
      this.prisma.userTrait.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      }),
      this.prisma.aliasMap.findMany({
        where: { workspaceId, userId },
        select: { anonymousId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.groupTrait.findMany({
        where: { workspaceId, userId },
        select: { groupId: true, traits: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const anonIds = aliases.map((a) => a.anonymousId)
    const eventWhere = {
      workspaceId,
      OR: [
        { userId },
        ...(anonIds.length > 0 ? [{ anonymousId: { in: anonIds } }] : []),
      ],
    }

    const [eventCount, firstEvent, lastEvent] = await Promise.all([
      this.prisma.event.count({ where: eventWhere }),
      this.prisma.event.findFirst({ where: eventWhere, orderBy: { receivedAt: 'asc' }, select: { receivedAt: true } }),
      this.prisma.event.findFirst({ where: eventWhere, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
    ])

    return {
      userId,
      traits: (traits?.traits ?? {}) as Record<string, unknown>,
      anonymousIds: aliases.map((a) => ({ anonymousId: a.anonymousId, linkedAt: a.createdAt.toISOString() })),
      groups: groups.map((g) => ({
        groupId: g.groupId,
        traits: (g.traits ?? {}) as Record<string, unknown>,
        joinedAt: g.createdAt.toISOString(),
      })),
      eventCount,
      firstSeen: firstEvent?.receivedAt.toISOString() ?? null,
      lastSeen: lastEvent?.receivedAt.toISOString() ?? null,
    }
  }

  async getThroughput(
    workspaceId: string,
    query: ThroughputQueryDto,
  ): Promise<{ buckets: ThroughputBucket[] }> {
    const { interval, trunc } = RANGE_CONFIG[query.range ?? '1h']

    const rows = await this.prisma.$queryRaw<{ time: Date; count: bigint }[]>(
      Prisma.sql`
        SELECT
          date_trunc(${trunc}, received_at) AS time,
          COUNT(*)::bigint                  AS count
        FROM ingestion.events
        WHERE workspace_id = ${workspaceId}
          AND received_at  >= NOW() - ${Prisma.raw(`INTERVAL '${interval}'`)}
        GROUP BY time
        ORDER BY time ASC
      `,
    )

    return {
      buckets: rows.map((r) => ({
        time: r.time.toISOString(),
        count: Number(r.count),
      })),
    }
  }
}

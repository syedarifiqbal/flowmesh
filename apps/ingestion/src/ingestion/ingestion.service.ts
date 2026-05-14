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
import { QueryEventsDto } from './dto/query-events.dto'
import { ThroughputQueryDto } from './dto/throughput-query.dto'

export interface ThroughputBucket {
  time: string
  count: number
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

    const where: Record<string, unknown> = { workspaceId }
    if (query.event) where['eventName'] = query.event
    if (query.source) where['source'] = query.source
    if (query.search) {
      where['OR'] = [
        { eventName: { contains: query.search, mode: 'insensitive' } },
        { source: { contains: query.search, mode: 'insensitive' } },
        { correlationId: { contains: query.search, mode: 'insensitive' } },
      ]
    }

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

    // Publish to pipeline queue
    await this.rabbitmq.publish({
      meta: {
        messageId: randomUUID(),
        correlationId: dto.correlationId,
        timestamp: new Date().toISOString(),
        source: 'ingestion',
        version: '1.0',
        workspaceId,
      },
      payload: {
        eventId,
        event: dto.event,
        source: dto.source,
        version: dto.version,
        userId: dto.userId,
        anonymousId: dto.anonymousId,
        sessionId: dto.sessionId,
        properties: dto.properties ?? {},
        context: dto.context ?? {},
        receivedAt: timestamp,
      },
    })

    // Mark as processed after successful publish
    await this.redis.markEventProcessed(eventId)

    // Publish to live event feed (fire-and-forget — never block ingestion for this)
    this.pubsub.publishEvent({
      id: eventId,
      eventId,
      eventName: dto.event,
      source: dto.source,
      userId: dto.userId ?? null,
      anonymousId: dto.anonymousId ?? null,
      correlationId: dto.correlationId,
      properties: dto.properties ?? {},
      receivedAt: timestamp,
      workspaceId,
    }).catch((err) => this.logger.warn({ err }, 'live event publish failed — non-critical'))

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

    // Publish so pipelines can react to alias events (e.g. welcome sequence after signup)
    await this.rabbitmq.publish({
      meta: {
        messageId: randomUUID(),
        correlationId: dto.correlationId,
        timestamp: new Date().toISOString(),
        source: 'ingestion',
        version: '1.0',
        workspaceId,
      },
      payload: {
        eventId,
        event: 'user.aliased',
        source: dto.source,
        version: dto.version,
        userId: dto.userId,
        anonymousId: dto.anonymousId,
        properties: { anonymousId: dto.anonymousId },
        context: {},
        receivedAt: timestamp,
      },
    })

    this.pubsub.publishEvent({
      id: eventId,
      eventId,
      eventName: 'user.aliased',
      source: dto.source,
      userId: dto.userId,
      anonymousId: dto.anonymousId,
      correlationId: dto.correlationId,
      properties: { anonymousId: dto.anonymousId },
      receivedAt: timestamp,
      workspaceId,
    }).catch((err) => this.logger.warn({ err }, 'live event publish failed — non-critical'))

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

    const existing = await this.prisma.userTrait.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: dto.userId } },
      select: { id: true },
    })

    await this.prisma.userTrait.upsert({
      where: { workspaceId_userId: { workspaceId, userId: dto.userId } },
      create: {
        workspaceId,
        userId: dto.userId,
        anonymousId: dto.anonymousId ?? null,
        traits: (dto.traits ?? {}) as object,
        source: dto.source,
        version: dto.version,
      },
      update: {
        anonymousId: dto.anonymousId ?? null,
        traits: (dto.traits ?? {}) as object,
        source: dto.source,
        version: dto.version,
      },
    })

    // Publish to pipeline so identify calls can trigger rules (e.g. welcome Slack message)
    await this.rabbitmq.publish({
      meta: {
        messageId: randomUUID(),
        correlationId: dto.correlationId,
        timestamp: new Date().toISOString(),
        source: 'ingestion',
        version: '1.0',
        workspaceId,
      },
      payload: {
        eventId,
        event: 'user.identified',
        source: dto.source,
        version: dto.version,
        userId: dto.userId,
        anonymousId: dto.anonymousId,
        properties: dto.traits ?? {},
        context: dto.context ?? {},
        receivedAt: timestamp,
      },
    })

    // Publish to live feed so the dashboard shows identify calls
    this.pubsub.publishEvent({
      id: eventId,
      eventId,
      eventName: 'user.identified',
      source: dto.source,
      userId: dto.userId,
      anonymousId: dto.anonymousId ?? null,
      correlationId: dto.correlationId,
      properties: dto.traits ?? {},
      receivedAt: timestamp,
      workspaceId,
    }).catch((err) => this.logger.warn({ err }, 'live event publish failed — non-critical'))

    this.logger.info({ userId: dto.userId, workspaceId, correlationId: dto.correlationId }, 'user identified')

    return { userId: dto.userId, status: existing ? 'updated' : 'created' }
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

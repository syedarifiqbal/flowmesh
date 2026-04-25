import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { PrismaService } from '../prisma/prisma.service'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { RedisService } from '../redis/redis.service'
import { IngestEventDto } from './dto/ingest-event.dto'

export interface IngestResult {
  eventId: string
  status: 'accepted' | 'duplicate'
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
    private readonly redis: RedisService,
    @InjectPinoLogger(IngestionService.name) private readonly logger: PinoLogger,
  ) {}

  async ingest(dto: IngestEventDto, workspaceId: string): Promise<IngestResult> {
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
        receivedAt: new Date(timestamp),
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

    this.logger.info({ eventId, correlationId: dto.correlationId, workspaceId, event: dto.event }, 'event accepted')

    return { eventId, status: 'accepted' }
  }

  async ingestBatch(
    events: IngestEventDto[],
    workspaceId: string,
  ): Promise<IngestResult[]> {
    return Promise.all(events.map((event) => this.ingest(event, workspaceId)))
  }
}

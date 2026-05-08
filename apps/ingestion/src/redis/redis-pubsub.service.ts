import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import Redis from 'ioredis'

const LIVE_EVENTS_CHANNEL = 'flowmesh:live'

export interface LiveEvent {
  id: string
  eventId: string
  eventName: string
  source: string
  userId: string | null
  anonymousId: string | null
  correlationId: string
  properties: Record<string, unknown>
  receivedAt: string
  workspaceId: string
}

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private publisher!: Redis

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(RedisPubSubService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_EPHEMERAL_URL')!
    this.publisher = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false })

    this.publisher.on('connect', () => this.logger.info('connected to redis (ephemeral pubsub)'))
    this.publisher.on('error', (err) => this.logger.error({ err }, 'redis ephemeral error'))
  }

  async onModuleDestroy() {
    await this.publisher.quit()
  }

  async publishEvent(event: LiveEvent): Promise<void> {
    const channel = `${LIVE_EVENTS_CHANNEL}:${event.workspaceId}`
    await this.publisher.publish(channel, JSON.stringify(event))
  }
}

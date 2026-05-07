import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

export type RedisSubscribeCallback = (channel: string, message: string) => void

const MAX_RETRY_ATTEMPTS = 10
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 30000

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private subscriber!: Redis
  private readonly logger = new Logger(RedisService.name)

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_EPHEMERAL_URL')!

    this.subscriber = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
      retryStrategy: (attempt) => {
        if (attempt > MAX_RETRY_ATTEMPTS) return null
        return Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
      },
    })

    this.subscriber.on('connect', () => this.logger.log('connected to redis (ephemeral subscriber)'))
    this.subscriber.on('error', (err) => this.logger.error({ err }, 'redis subscriber error'))
  }

  async onModuleDestroy() {
    await this.subscriber.quit()
  }

  async subscribe(channel: string, callback: RedisSubscribeCallback): Promise<void> {
    await this.subscriber.subscribe(channel)
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) callback(ch, message)
    })
  }

  async psubscribe(pattern: string, callback: RedisSubscribeCallback): Promise<void> {
    await this.subscriber.psubscribe(pattern)
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      callback(channel, message)
    })
  }
}

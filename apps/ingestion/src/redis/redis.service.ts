import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import Redis from 'ioredis'

const IDEMPOTENCY_TTL_SECONDS = 86400 // 24 hours
const MAX_RETRY_ATTEMPTS = 10
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 30000

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_PERSISTENT_URL')!

    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      retryStrategy: (attempt) => {
        if (attempt > MAX_RETRY_ATTEMPTS) {
          this.logger.error({ attempt }, 'redis max reconnect attempts reached — giving up')
          return null // ioredis stops retrying when null is returned
        }
        const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
        this.logger.warn({ attempt, delay }, 'redis unavailable — retrying')
        return delay
      },
    })

    this.client.on('connect', () => {
      this.logger.info('connected to redis (persistent)')
    })

    this.client.on('error', (err) => {
      this.logger.error({ err }, 'redis connection error')
    })

    this.client.on('end', () => {
      this.logger.error('redis connection ended — no more retries will be attempted')
    })
  }

  async onModuleDestroy() {
    await this.client.quit()
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    const key = `idempotency:${eventId}`
    const result = await this.client.get(key)
    return result !== null
  }

  async markEventProcessed(eventId: string): Promise<void> {
    const key = `idempotency:${eventId}`
    await this.client.set(key, '1', 'EX', IDEMPOTENCY_TTL_SECONDS)
  }
}

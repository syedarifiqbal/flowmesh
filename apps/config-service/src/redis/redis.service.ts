import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import Redis from 'ioredis'

const MAX_RETRY_ATTEMPTS = 10
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 30000

export const PIPELINE_CACHE_TTL = 300 // 5 minutes

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('REDIS_EPHEMERAL_URL')!, {
      lazyConnect: true,
      retryStrategy: (attempt) => {
        if (attempt > MAX_RETRY_ATTEMPTS) {
          this.logger.error('Redis max reconnect attempts reached — giving up')
          return null
        }
        const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
        this.logger.warn({ attempt, delay }, 'Redis unavailable — retrying')
        return delay
      },
    })

    this.client.on('connect', () => this.logger.info('Connected to Redis (ephemeral)'))
    this.client.on('error', (err: Error) => this.logger.error({ err }, 'Redis error'))
    this.client.on('end', () => this.logger.warn('Redis connection closed'))

    this.client.connect().catch((err: Error) => {
      this.logger.error({ err }, 'Redis initial connection failed')
    })
  }

  async onModuleDestroy() {
    await this.client?.quit()
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds)
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys)
  }
}

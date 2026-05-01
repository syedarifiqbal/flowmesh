import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

const MESSAGE_IDEMPOTENCY_TTL = 86400 // 24 hours
const MAX_RETRY_ATTEMPTS = 10
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 30000

export const PIPELINE_CONFIG_CACHE_TTL = 300 // 5 minutes

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private ephemeral!: Redis
  private persistent!: Redis
  private readonly logger = new Logger(RedisService.name)

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.ephemeral = this.createClient(
      this.config.get<string>('REDIS_EPHEMERAL_URL')!,
      'ephemeral',
    )
    this.persistent = this.createClient(
      this.config.get<string>('REDIS_PERSISTENT_URL')!,
      'persistent',
    )
  }

  async onModuleDestroy() {
    await Promise.all([this.ephemeral?.quit(), this.persistent?.quit()])
  }

  // Cache-aside operations — Redis 1 (ephemeral)
  async get(key: string): Promise<string | null> {
    return this.ephemeral.get(key)
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.ephemeral.set(key, value, 'EX', ttlSeconds)
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.ephemeral.del(...keys)
  }

  // Idempotency operations — Redis 2 (persistent)
  async isMessageProcessed(messageId: string): Promise<boolean> {
    const result = await this.persistent.get(`pipeline:idempotency:${messageId}`)
    return result !== null
  }

  async markMessageProcessed(messageId: string): Promise<void> {
    await this.persistent.set(
      `pipeline:idempotency:${messageId}`,
      '1',
      'EX',
      MESSAGE_IDEMPOTENCY_TTL,
    )
  }

  private createClient(url: string, name: string): Redis {
    const client = new Redis(url, {
      lazyConnect: true,
      retryStrategy: (attempt) => {
        if (attempt > MAX_RETRY_ATTEMPTS) {
          this.logger.error(`Redis ${name}: max reconnect attempts reached — giving up`)
          return null
        }
        const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
        this.logger.warn(`Redis ${name}: unavailable, retrying in ${delay}ms (attempt ${attempt})`)
        return delay
      },
    })

    client.on('connect', () => this.logger.log(`connected to Redis (${name})`))
    client.on('error', (err: Error) => this.logger.error(`Redis ${name} error: ${err.message}`))
    client.on('end', () => this.logger.error(`Redis ${name}: connection ended — no more retries`))

    client.connect().catch((err: Error) => {
      this.logger.error(`Redis ${name}: initial connection failed: ${err.message}`)
    })

    return client
  }
}

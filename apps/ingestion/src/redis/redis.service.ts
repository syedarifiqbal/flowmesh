import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

const IDEMPOTENCY_TTL_SECONDS = 86400 // 24 hours

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client!: Redis

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_PERSISTENT_URL')!

    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    })

    this.client.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`)
    })

    this.logger.log('Connected to Redis (persistent)')
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

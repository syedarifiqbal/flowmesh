import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import Redis from 'ioredis'

const IDEMPOTENCY_TTL_SECONDS = 86400 // 24 hours

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
    })

    this.client.on('error', (err) => {
      this.logger.error(err, 'redis connection error')
    })

    this.logger.info('connected to redis (persistent)')
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

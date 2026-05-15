import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class AlertRedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis
  private readonly logger = new Logger(AlertRedisService.name)

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('REDIS_EPHEMERAL_URL')!, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    })
    this.client.on('connect', () => this.logger.log('connected to redis (ephemeral)'))
    this.client.on('error', (err) => this.logger.error({ err }, 'redis error'))
  }

  async onModuleDestroy() {
    await this.client.quit()
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key)
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds)
  }

  // Returns 'OK' if key was set (NX = only if not exists), null if already existed
  async setNx(key: string, value: string, ttlSeconds: number): Promise<string | null> {
    return this.client.set(key, value, 'EX', ttlSeconds, 'NX')
  }
}

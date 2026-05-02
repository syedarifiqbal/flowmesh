import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

const BLACKLIST_PREFIX = 'auth:blacklist'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client!: Redis

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('REDIS_PERSISTENT_URL')!)
    this.client.on('error', (err: Error) => this.logger.error(`Redis error: ${err.message}`))
    this.logger.log('Redis persistent client connected')
  }

  async onModuleDestroy() {
    await this.client.quit()
  }

  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`${BLACKLIST_PREFIX}:${jti}`, '1', 'EX', ttlSeconds)
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const result = await this.client.exists(`${BLACKLIST_PREFIX}:${jti}`)
    return result === 1
  }

  async blacklistApiKey(keyHash: string): Promise<void> {
    await this.client.set(`${BLACKLIST_PREFIX}:apikey:${keyHash}`, '1')
  }

  async isApiKeyBlacklisted(keyHash: string): Promise<boolean> {
    const result = await this.client.exists(`${BLACKLIST_PREFIX}:apikey:${keyHash}`)
    return result === 1
  }
}

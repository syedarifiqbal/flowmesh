import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

const BLACKLIST_PREFIX = 'auth:blacklist'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private ephemeral!: Redis
  private persistent!: Redis

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.ephemeral = new Redis(this.config.get<string>('REDIS_EPHEMERAL_URL')!)
    this.persistent = new Redis(this.config.get<string>('REDIS_PERSISTENT_URL')!)
    this.ephemeral.on('error', (err: Error) => this.logger.error(`Redis ephemeral error: ${err.message}`))
    this.persistent.on('error', (err: Error) => this.logger.error(`Redis persistent error: ${err.message}`))
  }

  async onModuleDestroy() {
    await Promise.all([this.ephemeral.quit(), this.persistent.quit()])
  }

  async isJtiBlacklisted(jti: string): Promise<boolean> {
    return (await this.persistent.exists(`${BLACKLIST_PREFIX}:${jti}`)) === 1
  }

  async isApiKeyBlacklisted(keyHash: string): Promise<boolean> {
    return (await this.persistent.exists(`${BLACKLIST_PREFIX}:apikey:${keyHash}`)) === 1
  }

  // Fixed-window rate limit. Returns true if the request is allowed.
  async checkRateLimit(identifier: string, limitPerMinute: number): Promise<boolean> {
    const window = Math.floor(Date.now() / 60_000)
    const key = `gateway:ratelimit:${identifier}:${window}`
    const count = await this.ephemeral.incr(key)
    if (count === 1) {
      await this.ephemeral.expire(key, 120)
    }
    return count <= limitPerMinute
  }
}

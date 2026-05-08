import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { Request, Response } from 'express'
import { RedisService } from '../redis/redis.service'
import { AuthContext } from '../auth/auth.guard'

export type RateLimitTier = 'ingest' | 'mgmt'
export const RATE_LIMIT_TIER = 'rateLimitTier'
export const RateLimit = (tier: RateLimitTier) => SetMetadata(RATE_LIMIT_TIER, tier)

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name)

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tier = this.reflector.get<RateLimitTier>(RATE_LIMIT_TIER, context.getHandler()) ?? 'mgmt'
    const request = context.switchToHttp().getRequest<Request & { auth: AuthContext }>()
    const response = context.switchToHttp().getResponse<Response>()

    const limit = tier === 'ingest'
      ? this.config.get<number>('RATE_LIMIT_INGEST_RPM')!
      : this.config.get<number>('RATE_LIMIT_MGMT_RPM')!

    const identifier = `${tier}:${request.auth?.workspaceId ?? request.ip}`
    const allowed = await this.redis.checkRateLimit(identifier, limit)

    response.setHeader('X-RateLimit-Limit', limit)
    response.setHeader('X-RateLimit-Tier', tier)

    if (!allowed) {
      response.setHeader('Retry-After', '60')
      this.logger.warn({ identifier, tier }, 'rate limit exceeded')
      throw new HttpException('rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS)
    }

    return true
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { RateLimitGuard, RATE_LIMIT_TIER } from './rate-limit.guard'
import { RedisService } from '../redis/redis.service'

const makeRedis = () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
}) as unknown as RedisService

const makeConfig = () => ({
  get: vi.fn((key: string) => key === 'RATE_LIMIT_INGEST_RPM' ? 1000 : 100),
}) as unknown as ConfigService

const makeReflector = (tier: string) => ({
  get: vi.fn().mockReturnValue(tier),
}) as unknown as Reflector

const makeContext = (auth: { workspaceId?: string } = { workspaceId: 'ws-1' }): ExecutionContext => {
  const headers: Record<string, string> = {}
  const response = { setHeader: vi.fn() }
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ auth, ip: '127.0.0.1', headers }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext
}

describe('RateLimitGuard', () => {
  let redis: ReturnType<typeof makeRedis>
  let config: ReturnType<typeof makeConfig>

  beforeEach(() => {
    vi.clearAllMocks()
    redis = makeRedis()
    config = makeConfig()
  })

  it('allows request under ingest limit', async () => {
    const guard = new RateLimitGuard(redis, config, makeReflector('ingest'))
    vi.mocked(redis.checkRateLimit).mockResolvedValue(true)
    expect(await guard.canActivate(makeContext())).toBe(true)
    expect(redis.checkRateLimit).toHaveBeenCalledWith('ingest:ws-1', 1000)
  })

  it('allows request under mgmt limit', async () => {
    const guard = new RateLimitGuard(redis, config, makeReflector('mgmt'))
    vi.mocked(redis.checkRateLimit).mockResolvedValue(true)
    expect(await guard.canActivate(makeContext())).toBe(true)
    expect(redis.checkRateLimit).toHaveBeenCalledWith('mgmt:ws-1', 100)
  })

  it('throws TooManyRequestsException when limit exceeded', async () => {
    const guard = new RateLimitGuard(redis, config, makeReflector('ingest'))
    vi.mocked(redis.checkRateLimit).mockResolvedValue(false)
    const err = await guard.canActivate(makeContext()).catch(e => e)
    expect(err).toBeInstanceOf(HttpException)
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
  })

  it('uses ip as identifier when no auth context', async () => {
    const guard = new RateLimitGuard(redis, config, makeReflector('mgmt'))
    await guard.canActivate(makeContext({}))
    expect(redis.checkRateLimit).toHaveBeenCalledWith('mgmt:127.0.0.1', 100)
  })

  it('sets Retry-After header when limit exceeded', async () => {
    const guard = new RateLimitGuard(redis, config, makeReflector('mgmt'))
    vi.mocked(redis.checkRateLimit).mockResolvedValue(false)
    const ctx = makeContext()
    const res = ctx.switchToHttp().getResponse() as { setHeader: ReturnType<typeof vi.fn> }
    await expect(guard.canActivate(ctx)).rejects.toThrow()
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60')
  })
})

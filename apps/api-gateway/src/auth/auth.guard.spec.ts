import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from './auth.guard'
import { RedisService } from '../redis/redis.service'
import { ProxyService } from '../proxy/proxy.service'

const makeJwt = () => ({ verify: vi.fn() }) as unknown as JwtService
const makeConfig = () => ({
  get: vi.fn().mockReturnValue('test-jwt-secret'),
}) as unknown as ConfigService
const makeRedis = () => ({
  isJtiBlacklisted: vi.fn().mockResolvedValue(false),
  isApiKeyBlacklisted: vi.fn().mockResolvedValue(false),
}) as unknown as RedisService
const makeProxy = () => ({
  validateApiKey: vi.fn().mockResolvedValue('ws-uuid-1'),
}) as unknown as ProxyService

const makeContext = (headers: Record<string, string>): ExecutionContext => {
  const request: Record<string, unknown> = { headers }
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext
}

describe('AuthGuard', () => {
  let jwt: ReturnType<typeof makeJwt>
  let config: ReturnType<typeof makeConfig>
  let redis: ReturnType<typeof makeRedis>
  let proxy: ReturnType<typeof makeProxy>
  let guard: AuthGuard

  beforeEach(() => {
    vi.clearAllMocks()
    jwt = makeJwt()
    config = makeConfig()
    redis = makeRedis()
    proxy = makeProxy()
    guard = new AuthGuard(jwt, config, redis, proxy)
  })

  describe('JWT auth', () => {
    it('allows request with valid Bearer token', async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        sub: 'user-1', workspaceId: 'ws-1', type: 'access', jti: 'jti-1',
      } as never)

      const ctx = makeContext({ authorization: 'Bearer valid.token' })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      const req = ctx.switchToHttp().getRequest() as any
      expect(req.auth).toEqual({ userId: 'user-1', workspaceId: 'ws-1' })
    })

    it('throws when token is blacklisted', async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        sub: 'user-1', workspaceId: 'ws-1', type: 'access', jti: 'jti-1',
      } as never)
      vi.mocked(redis.isJtiBlacklisted).mockResolvedValue(true)

      const ctx = makeContext({ authorization: 'Bearer revoked.token' })
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    })

    it('throws when jwt.verify throws (expired/tampered)', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => { throw new Error('invalid') })

      const ctx = makeContext({ authorization: 'Bearer bad.token' })
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    })

    it('throws when token type is not access', async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        sub: 'user-1', workspaceId: 'ws-1', type: 'refresh', jti: 'jti-1',
      } as never)

      const ctx = makeContext({ authorization: 'Bearer refresh.token' })
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('API key auth', () => {
    it('allows request with valid x-api-key', async () => {
      vi.mocked(proxy.validateApiKey).mockResolvedValue('ws-uuid-1')

      const ctx = makeContext({ 'x-api-key': 'fm_abcdef' })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      const req = ctx.switchToHttp().getRequest() as any
      expect(req.auth).toEqual({ workspaceId: 'ws-uuid-1' })
    })

    it('throws when api key is blacklisted', async () => {
      vi.mocked(redis.isApiKeyBlacklisted).mockResolvedValue(true)

      const ctx = makeContext({ 'x-api-key': 'fm_revoked' })
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    })

    it('throws when proxy.validateApiKey returns null (key not found)', async () => {
      vi.mocked(proxy.validateApiKey).mockResolvedValue(null)

      const ctx = makeContext({ 'x-api-key': 'fm_unknown' })
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    })
  })

  it('throws when no credentials provided', async () => {
    const ctx = makeContext({})
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })
})

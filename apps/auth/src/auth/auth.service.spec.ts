import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import * as bcrypt from 'bcrypt'

const WORKSPACE_ID = 'ws-uuid-1'
const USER_ID = 'user-uuid-1'
const TOKEN_HASH = 'abc123hash'

const makeUser = (overrides = {}) => ({
  id: USER_ID,
  email: 'arif@example.com',
  passwordHash: '$2b$12$hashedpassword',
  workspaceId: WORKSPACE_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeWorkspace = () => ({
  id: WORKSPACE_ID,
  name: 'My Workspace',
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makeRefreshToken = (overrides = {}) => ({
  id: 'rt-uuid-1',
  userId: USER_ID,
  tokenHash: TOKEN_HASH,
  expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
  createdAt: new Date(),
  revokedAt: null,
  ...overrides,
})

const makePrisma = () => ({
  user: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
  },
  workspace: {
    create: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}) as unknown as PrismaService

const makeRedis = () => ({
  blacklistToken: vi.fn().mockResolvedValue(undefined),
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
}) as unknown as RedisService

const makeJwt = () => ({
  sign: vi.fn().mockReturnValue('signed.token.here'),
  verify: vi.fn(),
}) as unknown as JwtService

const makeConfig = () =>
  ({
    get: vi.fn((key: string) => {
      const map: Record<string, string> = {
        JWT_SECRET: 'test-jwt-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      }
      return map[key]
    }),
  }) as unknown as ConfigService

describe('AuthService', () => {
  let prisma: ReturnType<typeof makePrisma>
  let redis: ReturnType<typeof makeRedis>
  let jwt: ReturnType<typeof makeJwt>
  let config: ReturnType<typeof makeConfig>
  let service: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = makePrisma()
    redis = makeRedis()
    jwt = makeJwt()
    config = makeConfig()
    service = new AuthService(prisma, redis, jwt, config)
  })

  describe('register', () => {
    it('creates workspace and user, returns token pair', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.workspace.create).mockResolvedValue(makeWorkspace())
      vi.mocked(prisma.user.create).mockResolvedValue(makeUser())
      vi.mocked(prisma.refreshToken.create).mockResolvedValue(makeRefreshToken())

      const result = await service.register({
        email: 'arif@example.com',
        password: 'password123',
        workspaceName: 'My Workspace',
      })

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(prisma.workspace.create).toHaveBeenCalled()
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'arif@example.com' }) }),
      )
    })

    it('throws ConflictException when email already registered', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser())

      await expect(
        service.register({ email: 'arif@example.com', password: 'password123', workspaceName: 'WS' }),
      ).rejects.toThrow(ConflictException)

      expect(prisma.workspace.create).not.toHaveBeenCalled()
    })
  })

  describe('login', () => {
    it('returns token pair on valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 12)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ passwordHash: hash }))
      vi.mocked(prisma.refreshToken.create).mockResolvedValue(makeRefreshToken())

      const result = await service.login({ email: 'arif@example.com', password: 'password123' })

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('throws UnauthorizedException when user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(
        service.login({ email: 'nobody@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException on wrong password', async () => {
      const hash = await bcrypt.hash('correctpassword', 12)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ passwordHash: hash }))

      await expect(
        service.login({ email: 'arif@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('refresh', () => {
    it('rotates refresh token and returns new pair', async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        sub: USER_ID,
        jti: 'jti-1',
        type: 'refresh',
      } as never)
      vi.mocked(redis.isTokenBlacklisted).mockResolvedValue(false)
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(makeRefreshToken())
      vi.mocked(prisma.refreshToken.update).mockResolvedValue(makeRefreshToken({ revokedAt: new Date() }))
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(makeUser())
      vi.mocked(prisma.refreshToken.create).mockResolvedValue(makeRefreshToken())

      const result = await service.refresh('raw.refresh.token')

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
      )
    })

    it('throws UnauthorizedException when token is blacklisted', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, jti: 'jti-1', type: 'refresh' } as never)
      vi.mocked(redis.isTokenBlacklisted).mockResolvedValue(true)

      await expect(service.refresh('raw.refresh.token')).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when token not found in db', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, jti: 'jti-1', type: 'refresh' } as never)
      vi.mocked(redis.isTokenBlacklisted).mockResolvedValue(false)
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(null)

      await expect(service.refresh('raw.refresh.token')).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when jwt.verify throws (expired/invalid)', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => { throw new Error('jwt expired') })

      await expect(service.refresh('expired.token')).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('logout', () => {
    it('revokes refresh token and blacklists jti', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, jti: 'jti-1', type: 'refresh' } as never)
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(makeRefreshToken())
      vi.mocked(prisma.refreshToken.update).mockResolvedValue(makeRefreshToken({ revokedAt: new Date() }))

      await service.logout('raw.refresh.token')

      expect(redis.blacklistToken).toHaveBeenCalledWith('jti-1', expect.any(Number))
      expect(prisma.refreshToken.update).toHaveBeenCalled()
    })

    it('silently succeeds when token is expired/invalid', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => { throw new Error('jwt expired') })

      await expect(service.logout('expired.token')).resolves.toBeUndefined()
    })
  })
})

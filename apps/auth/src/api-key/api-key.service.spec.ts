import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { ApiKeyService } from './api-key.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

const WORKSPACE_ID = 'ws-uuid-1'
const KEY_ID = 'key-uuid-1'

const makeApiKeyRecord = (overrides = {}) => ({
  id: KEY_ID,
  workspaceId: WORKSPACE_ID,
  name: 'My Key',
  keyHash: 'sha256hashofkey',
  keyPrefix: 'fm_a3b9c1',
  createdAt: new Date(),
  revokedAt: null,
  ...overrides,
})

const makePrisma = () => ({
  apiKey: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}) as unknown as PrismaService

const makeRedis = () => ({
  blacklistApiKey: vi.fn().mockResolvedValue(undefined),
  isApiKeyBlacklisted: vi.fn().mockResolvedValue(false),
}) as unknown as RedisService

describe('ApiKeyService', () => {
  let prisma: ReturnType<typeof makePrisma>
  let redis: ReturnType<typeof makeRedis>
  let service: ApiKeyService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = makePrisma()
    redis = makeRedis()
    service = new ApiKeyService(prisma, redis)
  })

  describe('create', () => {
    it('returns plaintext key and stores only the hash', async () => {
      vi.mocked(prisma.apiKey.create).mockResolvedValue(makeApiKeyRecord())

      const result = await service.create(WORKSPACE_ID, { name: 'My Key' })

      expect(result.key).toMatch(/^fm_[a-f0-9]{64}$/)
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('keyPrefix')
      expect(result).not.toHaveProperty('keyHash')

      const createCall = vi.mocked(prisma.apiKey.create).mock.calls[0][0]
      expect(createCall.data.keyHash).not.toEqual(result.key)
      expect(createCall.data.keyPrefix).toEqual(result.key.slice(0, 11))
    })
  })

  describe('list', () => {
    it('returns keys without hash', async () => {
      const keys = [
        { id: KEY_ID, name: 'Key 1', keyPrefix: 'fm_a3b9c1', createdAt: new Date(), revokedAt: null },
      ]
      vi.mocked(prisma.apiKey.findMany).mockResolvedValue(keys as never)

      const result = await service.list(WORKSPACE_ID)

      expect(result).toEqual(keys)
      expect(vi.mocked(prisma.apiKey.findMany).mock.calls[0][0]).toMatchObject({
        where: { workspaceId: WORKSPACE_ID },
      })
    })
  })

  describe('revoke', () => {
    it('sets revokedAt and blacklists the key hash in Redis', async () => {
      vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(makeApiKeyRecord())
      vi.mocked(prisma.apiKey.update).mockResolvedValue(makeApiKeyRecord({ revokedAt: new Date() }))

      await service.revoke(WORKSPACE_ID, KEY_ID)

      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      )
      expect(redis.blacklistApiKey).toHaveBeenCalledWith('sha256hashofkey')
    })

    it('throws NotFoundException when key does not belong to workspace', async () => {
      vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null)

      await expect(service.revoke(WORKSPACE_ID, KEY_ID)).rejects.toThrow(NotFoundException)
      expect(redis.blacklistApiKey).not.toHaveBeenCalled()
    })
  })

  describe('validateApiKey', () => {
    it('returns workspaceId for a valid key', async () => {
      vi.mocked(redis.isApiKeyBlacklisted).mockResolvedValue(false)
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(
        makeApiKeyRecord() as never,
      )

      const result = await service.validateApiKey('fm_' + 'a'.repeat(64))

      expect(result).toEqual({ workspaceId: WORKSPACE_ID })
    })

    it('returns null when key is blacklisted in Redis', async () => {
      vi.mocked(redis.isApiKeyBlacklisted).mockResolvedValue(true)

      const result = await service.validateApiKey('fm_' + 'a'.repeat(64))

      expect(result).toBeNull()
      expect(prisma.apiKey.findUnique).not.toHaveBeenCalled()
    })

    it('returns null when key is revoked in database', async () => {
      vi.mocked(redis.isApiKeyBlacklisted).mockResolvedValue(false)
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(
        makeApiKeyRecord({ revokedAt: new Date() }) as never,
      )

      const result = await service.validateApiKey('fm_' + 'a'.repeat(64))

      expect(result).toBeNull()
    })

    it('returns null when key does not exist', async () => {
      vi.mocked(redis.isApiKeyBlacklisted).mockResolvedValue(false)
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null)

      const result = await service.validateApiKey('fm_notakey')

      expect(result).toBeNull()
    })
  })
})

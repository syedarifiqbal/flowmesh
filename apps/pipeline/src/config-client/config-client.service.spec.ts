import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigClientService } from './config-client.service'
import { ConfigService } from '@nestjs/config'
import { CacheKeyFactory } from '@flowmesh/nestjs-common'
import { RedisService } from '../redis/redis.service'
import { Pipeline } from '@flowmesh/shared-types'

const makePipeline = (overrides: Partial<Pipeline> = {}): Pipeline => ({
  id: 'pipe-1',
  workspaceId: 'ws-1',
  name: 'Test Pipeline',
  trigger: { type: 'event', events: ['order.created'] },
  steps: [],
  enabled: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
})

const makeConfigService = (url = 'http://config-service:3005') =>
  ({ get: vi.fn().mockReturnValue(url) }) as unknown as ConfigService

const makeRedisService = () =>
  ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  }) as unknown as RedisService

const makeCacheKey = () =>
  ({
    list: vi.fn().mockReturnValue('pipeline:config:ws-1:list'),
    one: vi.fn().mockReturnValue('pipeline:config:ws-1:pipe-1'),
    pattern: vi.fn().mockReturnValue('pipeline:config:ws-1:*'),
  }) as unknown as CacheKeyFactory

describe('ConfigClientService', () => {
  let redis: ReturnType<typeof makeRedisService>
  let cacheKey: ReturnType<typeof makeCacheKey>
  let service: ConfigClientService

  beforeEach(() => {
    vi.clearAllMocks()
    redis = makeRedisService()
    cacheKey = makeCacheKey()
    service = new ConfigClientService(makeConfigService(), redis, cacheKey)
    service.onModuleInit()
  })

  describe('getPipelinesForWorkspace', () => {
    it('returns cached pipelines on cache hit', async () => {
      const pipelines = [makePipeline()]
      vi.mocked(redis.get).mockResolvedValueOnce(JSON.stringify(pipelines))

      const result = await service.getPipelinesForWorkspace('ws-1')

      expect(result).toEqual(pipelines)
      expect(redis.set).not.toHaveBeenCalled()
    })

    it('fetches from config-service on cache miss and writes to cache', async () => {
      const pipelines = [makePipeline()]
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(pipelines),
      })

      const result = await service.getPipelinesForWorkspace('ws-1')

      expect(result).toEqual(pipelines)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://config-service:3005/pipelines',
        expect.objectContaining({ headers: { 'x-workspace-id': 'ws-1' } }),
      )
      expect(redis.set).toHaveBeenCalledWith(
        'pipeline:config:ws-1:list',
        JSON.stringify(pipelines),
        300,
      )
    })

    it('throws when config-service returns a non-ok status', async () => {
      vi.mocked(redis.get).mockResolvedValueOnce(null)
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })

      await expect(service.getPipelinesForWorkspace('ws-1')).rejects.toThrow('503')
    })
  })

  describe('invalidateWorkspaceCache', () => {
    it('deletes the cache key for the workspace', async () => {
      await service.invalidateWorkspaceCache('ws-1')
      expect(redis.del).toHaveBeenCalledWith('pipeline:config:ws-1:list')
    })
  })
})

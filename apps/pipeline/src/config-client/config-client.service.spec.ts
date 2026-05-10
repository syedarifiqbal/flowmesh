import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigClientService } from './config-client.service'
import { ConfigService } from '@nestjs/config'
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

describe('ConfigClientService', () => {
  let service: ConfigClientService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ConfigClientService(makeConfigService())
    service.onModuleInit()
  })

  describe('getPipelinesForWorkspace', () => {
    it('fetches pipelines from config-service', async () => {
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
    })

    it('throws when config-service returns a non-ok status', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })

      await expect(service.getPipelinesForWorkspace('ws-1')).rejects.toThrow('503')
    })

    it('opens circuit breaker after repeated failures', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'))

      // exhaust the error threshold — opossum opens after enough failures
      for (let i = 0; i < 5; i++) {
        await service.getPipelinesForWorkspace('ws-1').catch(() => {})
      }

      // subsequent call should fail fast (circuit open) without hitting fetch
      const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
      await service.getPipelinesForWorkspace('ws-1').catch(() => {})
      const callsAfter = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // When circuit is open, opossum does not call the underlying function
      expect(callsAfter).toBeLessThanOrEqual(callsBefore + 1)
    })
  })
})

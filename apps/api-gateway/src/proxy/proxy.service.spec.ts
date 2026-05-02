import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ServiceUnavailableException } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { of, throwError } from 'rxjs'
import { AxiosResponse } from 'axios'
import { ProxyService } from './proxy.service'

const makeHttp = () => ({
  request: vi.fn(),
  post: vi.fn(),
}) as unknown as HttpService

const makeConfig = () => ({
  get: vi.fn((key: string) => {
    const map: Record<string, string> = {
      AUTH_SERVICE_URL: 'http://auth:3004',
      INGESTION_SERVICE_URL: 'http://ingestion:3001',
    }
    return map[key]
  }),
}) as unknown as ConfigService

const makeAxiosResponse = (data: unknown, status = 200): AxiosResponse => ({
  data,
  status,
  headers: { 'content-type': 'application/json' },
  statusText: 'OK',
  config: {} as never,
})

describe('ProxyService', () => {
  let http: ReturnType<typeof makeHttp>
  let config: ReturnType<typeof makeConfig>
  let service: ProxyService

  beforeEach(() => {
    vi.clearAllMocks()
    http = makeHttp()
    config = makeConfig()
    service = new ProxyService(http, config)
  })

  describe('forward', () => {
    it('forwards request and sets status + body from upstream', async () => {
      vi.mocked(http.request).mockReturnValue(of(makeAxiosResponse({ ok: true }, 202)))
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': 'corr-1' },
        body: { event: 'test' },
        auth: { workspaceId: 'ws-1', userId: 'user-1' },
      } as never
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() }

      await service.forward(req, res as never, 'http://ingestion:3001/events')

      expect(res.status).toHaveBeenCalledWith(202)
      expect(res.json).toHaveBeenCalledWith({ ok: true })
    })

    it('throws ServiceUnavailableException when upstream is down', async () => {
      vi.mocked(http.request).mockReturnValue(throwError(() => new Error('ECONNREFUSED')))
      const req = {
        method: 'GET',
        headers: {},
        body: undefined,
        auth: { workspaceId: 'ws-1' },
      } as never
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() }

      await expect(service.forward(req, res as never, 'http://ingestion:3001/')).rejects.toThrow(
        ServiceUnavailableException,
      )
    })
  })

  describe('validateApiKey', () => {
    it('returns workspaceId when auth service confirms key', async () => {
      vi.mocked(http.post).mockReturnValue(of(makeAxiosResponse({ workspaceId: 'ws-1' })))
      const result = await service.validateApiKey('hashvalue')
      expect(result).toBe('ws-1')
    })

    it('returns null when auth service is unreachable', async () => {
      vi.mocked(http.post).mockReturnValue(throwError(() => new Error('ECONNREFUSED')))
      const result = await service.validateApiKey('hashvalue')
      expect(result).toBeNull()
    })
  })
})

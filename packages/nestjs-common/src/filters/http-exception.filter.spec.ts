import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpException, HttpStatus } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { HttpExceptionFilter } from './http-exception.filter'
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

const makeHost = (overrides: { url?: string; method?: string; correlationId?: string } = {}) => {
  const req = {
    url: overrides.url ?? '/pipelines',
    method: overrides.method ?? 'GET',
    headers: { [CORRELATION_ID_HEADER]: overrides.correlationId ?? 'corr-123' },
  }
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    res,
  } as any
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter

  beforeEach(() => {
    vi.clearAllMocks()
    filter = new HttpExceptionFilter(mockLogger)
  })

  it('returns correct shape for a 400 HttpException', () => {
    const host = makeHost()
    filter.catch(new HttpException('Bad Request', HttpStatus.BAD_REQUEST), host)

    expect(host.res.status).toHaveBeenCalledWith(400)
    expect(host.res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, correlationId: 'corr-123' }),
    )
  })

  it('logs 4xx at warn level', () => {
    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), makeHost())
    expect(mockLogger.warn).toHaveBeenCalledOnce()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('logs 5xx at error level', () => {
    filter.catch(new HttpException('Server Error', HttpStatus.INTERNAL_SERVER_ERROR), makeHost())
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('returns 500 and logs for unhandled non-HttpException', () => {
    const host = makeHost()
    filter.catch(new Error('boom'), host)

    expect(host.res.status).toHaveBeenCalledWith(500)
    expect(mockLogger.error).toHaveBeenCalledTimes(2)
  })

  it('includes validation error message array from NestJS ValidationPipe', () => {
    const host = makeHost()
    const body = { statusCode: 400, message: ['name must be a string'], error: 'Bad Request' }
    filter.catch(new HttpException(body, HttpStatus.BAD_REQUEST), host)

    const jsonArg = host.res.json.mock.calls[0][0]
    expect(jsonArg.message).toEqual(['name must be a string'])
    expect(jsonArg.error).toBe('Bad Request')
  })

  it('omits correlationId when header is absent', () => {
    const host = makeHost({ correlationId: undefined as any })
    // Override to have no header
    host.switchToHttp().getRequest().headers = {}
    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), host)

    const jsonArg = host.res.json.mock.calls[0][0]
    expect(jsonArg).not.toHaveProperty('correlationId')
  })
})

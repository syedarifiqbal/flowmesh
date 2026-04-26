import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpException, HttpStatus } from '@nestjs/common'
import { HttpExceptionFilter } from './http-exception.filter'
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware'

vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>()
  return {
    ...actual,
    Logger: class {
      error = vi.fn()
      warn = vi.fn()
      log = vi.fn()
    },
  }
})

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
    req,
  } as any
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter

  beforeEach(() => {
    vi.clearAllMocks()
    filter = new HttpExceptionFilter()
  })

  it('returns correct shape for a 400 HttpException', () => {
    const host = makeHost()
    filter.catch(new HttpException('Bad Request', HttpStatus.BAD_REQUEST), host)

    expect(host.res.status).toHaveBeenCalledWith(400)
    expect(host.res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, correlationId: 'corr-123' }),
    )
  })

  it('returns 500 for unhandled non-HttpException', () => {
    const host = makeHost()
    filter.catch(new Error('boom'), host)

    expect(host.res.status).toHaveBeenCalledWith(500)
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
    const host = makeHost()
    host.switchToHttp().getRequest().headers = {}
    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), host)

    const jsonArg = host.res.json.mock.calls[0][0]
    expect(jsonArg).not.toHaveProperty('correlationId')
  })
})

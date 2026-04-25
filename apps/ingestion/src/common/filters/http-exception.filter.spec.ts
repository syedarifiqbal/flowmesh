import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ArgumentsHost, BadRequestException, HttpStatus, InternalServerErrorException } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { HttpExceptionFilter } from './http-exception.filter'

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger

const makeHost = (overrides: {
  url?: string
  method?: string
  correlationIdHeader?: string
}) => {
  const req: Record<string, unknown> = {
    url: overrides.url ?? '/events',
    method: overrides.method ?? 'POST',
    headers: overrides.correlationIdHeader
      ? { 'x-correlation-id': overrides.correlationIdHeader }
      : {},
  }

  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const res = { status }

  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost

  return { host, json, status }
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter

  beforeEach(() => {
    vi.clearAllMocks()
    filter = new HttpExceptionFilter(mockLogger)
  })

  it('returns standard envelope for BadRequestException', () => {
    const { host, status, json } = makeHost({})
    filter.catch(new BadRequestException('correlationId is required'), host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: expect.any(String),
        message: expect.any(String),
      }),
    )
  })

  it('includes correlationId from x-correlation-id header', () => {
    const { host, json } = makeHost({ correlationIdHeader: 'corr-123' })
    filter.catch(new BadRequestException('bad input'), host)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-123' }),
    )
  })

  it('omits correlationId when not present in request', () => {
    const { host, json } = makeHost({})
    filter.catch(new BadRequestException('bad input'), host)

    const response = json.mock.calls[0][0] as Record<string, unknown>
    expect(response).not.toHaveProperty('correlationId')
  })

  it('returns 500 for unhandled errors with safe message', () => {
    const { host, status, json } = makeHost({})
    filter.catch(new Error('something exploded'), host)

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'An unexpected error occurred',
      }),
    )
  })

  it('logs warn for 4xx errors', () => {
    const { host } = makeHost({})
    filter.catch(new BadRequestException('bad input'), host)
    expect(mockLogger.warn).toHaveBeenCalledOnce()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('logs error for 5xx errors', () => {
    const { host } = makeHost({})
    filter.catch(new InternalServerErrorException('db down'), host)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('logs unhandled non-http exceptions at error level', () => {
    const { host } = makeHost({})
    filter.catch(new Error('unexpected'), host)
    expect(mockLogger.error).toHaveBeenCalledTimes(2) // once for unhandled, once for 500
  })
})

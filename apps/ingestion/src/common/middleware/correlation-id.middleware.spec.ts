import { describe, it, expect, vi } from 'vitest'
import { Request, Response } from 'express'
import { CorrelationIdMiddleware, CORRELATION_ID_HEADER } from './correlation-id.middleware'

const makeReq = (correlationId?: string): Request =>
  ({
    headers: correlationId ? { [CORRELATION_ID_HEADER]: correlationId } : {},
  }) as unknown as Request

const makeRes = () => {
  const setHeader = vi.fn()
  return { setHeader } as unknown as Response & { setHeader: typeof setHeader }
}

describe('CorrelationIdMiddleware', () => {
  const middleware = new CorrelationIdMiddleware()

  it('passes through the existing correlation id when provided', () => {
    const req = makeReq('existing-id-123')
    const res = makeRes()
    const next = vi.fn()

    middleware.use(req, res, next)

    expect(req.headers[CORRELATION_ID_HEADER]).toBe('existing-id-123')
    expect((res as any).setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'existing-id-123')
    expect(next).toHaveBeenCalledOnce()
  })

  it('generates a uuid when no correlation id is present', () => {
    const req = makeReq()
    const res = makeRes()
    const next = vi.fn()

    middleware.use(req, res, next)

    const id = req.headers[CORRELATION_ID_HEADER] as string
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect((res as any).setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, id)
  })

  it('always calls next', () => {
    const next = vi.fn()
    middleware.use(makeReq(), makeRes(), next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('sets different ids for different requests', () => {
    const req1 = makeReq()
    const req2 = makeReq()
    const next = vi.fn()

    middleware.use(req1, makeRes(), next)
    middleware.use(req2, makeRes(), next)

    expect(req1.headers[CORRELATION_ID_HEADER]).not.toBe(req2.headers[CORRELATION_ID_HEADER])
  })
})

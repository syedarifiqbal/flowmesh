import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CorrelationIdMiddleware, CORRELATION_ID_HEADER } from './correlation-id.middleware'
import { Request, Response } from 'express'

const makeReq = (headers: Record<string, string> = {}) =>
  ({ headers } as unknown as Request)

const makeRes = () => {
  const res = { setHeader: vi.fn() } as unknown as Response
  return res
}

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware()
  })

  it('passes through an existing correlation id', () => {
    const id = 'existing-id'
    const req = makeReq({ [CORRELATION_ID_HEADER]: id })
    const res = makeRes()
    const next = vi.fn()

    middleware.use(req, res, next)

    expect(req.headers[CORRELATION_ID_HEADER]).toBe(id)
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, id)
    expect(next).toHaveBeenCalledOnce()
  })

  it('generates a uuid when correlation id header is absent', () => {
    const req = makeReq()
    const res = makeRes()
    const next = vi.fn()

    middleware.use(req, res, next)

    const id = req.headers[CORRELATION_ID_HEADER] as string
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, id)
    expect(next).toHaveBeenCalledOnce()
  })

  it('generates unique ids for each request', () => {
    const req1 = makeReq()
    const req2 = makeReq()

    middleware.use(req1, makeRes(), vi.fn())
    middleware.use(req2, makeRes(), vi.fn())

    expect(req1.headers[CORRELATION_ID_HEADER]).not.toBe(req2.headers[CORRELATION_ID_HEADER])
  })
})

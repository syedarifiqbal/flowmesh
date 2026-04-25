import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Request, Response, NextFunction } from 'express'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string | undefined) ?? randomUUID()

    req.headers[CORRELATION_ID_HEADER] = correlationId
    res.setHeader(CORRELATION_ID_HEADER, correlationId)

    next()
  }
}

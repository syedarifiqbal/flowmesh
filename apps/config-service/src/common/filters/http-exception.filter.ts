import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Request, Response } from 'express'
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware'

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<Request>()

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error'

    const correlationId = req.headers[CORRELATION_ID_HEADER] as string | undefined

    res.status(status).json({
      statusCode: status,
      error: typeof message === 'object' && 'error' in (message as object)
        ? (message as Record<string, unknown>).error
        : HttpStatus[status],
      message: typeof message === 'object' && 'message' in (message as object)
        ? (message as Record<string, unknown>).message
        : message,
      correlationId,
    })
  }
}

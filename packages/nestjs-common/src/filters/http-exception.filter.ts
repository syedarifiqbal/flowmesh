import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { Request, Response } from 'express'
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<Request>()
    const res = ctx.getResponse<Response>()

    const correlationId = req.headers[CORRELATION_ID_HEADER] as string | undefined

    let statusCode: number
    let error: string
    let message: string | string[]

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus()
      const body = exception.getResponse()
      if (typeof body === 'string') {
        error = exception.name
        message = body
      } else {
        const b = body as Record<string, unknown>
        error = (b.error as string | undefined) ?? exception.name
        message = (b.message as string | string[] | undefined) ?? exception.message
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR
      error = 'Internal Server Error'
      message = 'An unexpected error occurred'
      this.logger.error({ err: exception, correlationId, url: req.url, method: req.method }, 'unhandled exception')
    }

    if (statusCode >= 500) {
      this.logger.error({ statusCode, correlationId, url: req.url, method: req.method }, message as string)
    } else {
      this.logger.warn({ statusCode, correlationId, url: req.url, method: req.method }, message as string)
    }

    res.status(statusCode).json({
      statusCode,
      error,
      message,
      ...(correlationId ? { correlationId } : {}),
    })
  }
}

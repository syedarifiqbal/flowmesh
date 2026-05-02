import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { Request, Response } from 'express'
import { firstValueFrom, catchError } from 'rxjs'
import { AxiosError, AxiosRequestConfig } from 'axios'
import { AuthContext } from '../auth/auth.guard'
import { CORRELATION_ID_HEADER } from '@flowmesh/nestjs-common'

const PROXY_TIMEOUT_MS = 10_000

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async forward(
    request: Request & { auth?: AuthContext },
    response: Response,
    targetUrl: string,
  ): Promise<void> {
    const headers = this.buildForwardHeaders(request)
    const config: AxiosRequestConfig = {
      method: request.method as AxiosRequestConfig['method'],
      url: targetUrl,
      headers,
      data: request.body,
      timeout: PROXY_TIMEOUT_MS,
      validateStatus: () => true,
    }

    const { data, status, headers: resHeaders } = await firstValueFrom(
      this.http.request(config).pipe(
        catchError((err: AxiosError) => {
          this.logger.error({ url: targetUrl, err: err.message }, 'proxy request failed')
          throw new ServiceUnavailableException('upstream service unavailable')
        }),
      ),
    )

    const forwardedHeaders = ['content-type', 'x-correlation-id']
    for (const header of forwardedHeaders) {
      if (resHeaders[header]) response.setHeader(header, resHeaders[header] as string)
    }

    response.status(status).json(data)
  }

  async validateApiKey(keyHash: string): Promise<string | null> {
    const url = `${this.config.get('AUTH_SERVICE_URL')}/internal/api-keys/validate`
    try {
      const { data } = await firstValueFrom(
        this.http.post<{ workspaceId: string }>(url, { keyHash }, { timeout: PROXY_TIMEOUT_MS }).pipe(
          catchError(() => { throw new Error('auth service unavailable') }),
        ),
      )
      return data.workspaceId
    } catch {
      return null
    }
  }

  private buildForwardHeaders(request: Request & { auth?: AuthContext }): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': request.headers['content-type'] ?? 'application/json',
    }

    const correlationId = request.headers[CORRELATION_ID_HEADER] as string | undefined
    if (correlationId) headers[CORRELATION_ID_HEADER] = correlationId

    if (request.auth?.workspaceId) headers['x-workspace-id'] = request.auth.workspaceId
    if (request.auth?.userId) headers['x-user-id'] = request.auth.userId

    return headers
  }
}

import { All, Controller, Req, Res, UseGuards } from '@nestjs/common'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '../auth/auth.guard'
import { RateLimitGuard, RateLimit } from '../rate-limit/rate-limit.guard'
import { ProxyService } from '../proxy/proxy.service'

// Routes all authenticated management API calls to the appropriate downstream service.
// /pipelines/* and /destinations/* → config-service
// /api-keys/* → auth service
// /events* (GET reads) → ingestion service
// /executions* → pipeline service
// /dlq* → delivery service
// /delivery/error-rate* → delivery service
@Controller()
@UseGuards(AuthGuard, RateLimitGuard)
@RateLimit('mgmt')
export class ManagementController {
  constructor(
    private readonly proxy: ProxyService,
    private readonly config: ConfigService,
  ) {}

  @All('pipelines*')
  async pipelines(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('CONFIG_SERVICE_URL')!
    await this.proxy.forward(req, res, `${base}${req.url}`)
  }

  @All('destinations*')
  async destinations(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('CONFIG_SERVICE_URL')!
    await this.proxy.forward(req, res, `${base}${req.url}`)
  }

  @All('api-keys*')
  async apiKeys(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('AUTH_SERVICE_URL')!
    const upstreamUrl = req.url.replace(/^\/api-keys/, '/auth/api-keys')
    await this.proxy.forward(req, res, `${base}${upstreamUrl}`)
  }

  @All('events*')
  async events(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('INGESTION_SERVICE_URL')!
    await this.proxy.forward(req, res, `${base}${req.url}`)
  }

  @All('executions*')
  async executions(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('PIPELINE_SERVICE_URL')!
    await this.proxy.forward(req, res, `${base}${req.url}`)
  }

  @All('dlq*')
  async dlq(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('DELIVERY_SERVICE_URL')!
    await this.proxy.forward(req, res, `${base}${req.url}`)
  }

  @All('delivery/error-rate*')
  async deliveryErrorRate(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('DELIVERY_SERVICE_URL')!
    const upstreamUrl = req.url.replace(/^\/delivery\/error-rate/, '/error-rate')
    await this.proxy.forward(req, res, `${base}${upstreamUrl}`)
  }
}

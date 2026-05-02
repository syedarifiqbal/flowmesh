import { All, Controller, Req, Res, UseGuards } from '@nestjs/common'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '../auth/auth.guard'
import { RateLimitGuard, RateLimit } from '../rate-limit/rate-limit.guard'
import { ProxyService } from '../proxy/proxy.service'

// Routes all authenticated management API calls to the appropriate downstream service.
// /pipelines/* and /destinations/* → config-service
// /api-keys/* → auth service
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
    await this.proxy.forward(req, res, `${base}${req.path}`)
  }

  @All('destinations*')
  async destinations(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('CONFIG_SERVICE_URL')!
    await this.proxy.forward(req, res, `${base}${req.path}`)
  }

  @All('api-keys*')
  async apiKeys(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('AUTH_SERVICE_URL')!
    await this.proxy.forward(req, res, `${base}${req.path}`)
  }
}

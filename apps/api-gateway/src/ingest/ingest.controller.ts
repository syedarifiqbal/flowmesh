import { All, Controller, Req, Res, UseGuards } from '@nestjs/common'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '../auth/auth.guard'
import { RateLimitGuard, RateLimit } from '../rate-limit/rate-limit.guard'
import { ProxyService } from '../proxy/proxy.service'

@Controller('ingest')
@UseGuards(AuthGuard, RateLimitGuard)
@RateLimit('ingest')
export class IngestController {
  constructor(
    private readonly proxy: ProxyService,
    private readonly config: ConfigService,
  ) {}

  @All('*')
  async forward(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('INGESTION_SERVICE_URL')!
    const path = req.path.replace(/^\/ingest/, '') || '/'
    await this.proxy.forward(req, res, `${base}${path}`)
  }
}

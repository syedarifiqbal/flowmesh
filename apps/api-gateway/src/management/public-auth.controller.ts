import { All, Controller, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { ProxyService } from '../proxy/proxy.service'

// Public auth endpoints — no authentication required (users don't have tokens yet)
@Controller('auth')
export class PublicAuthController {
  constructor(
    private readonly proxy: ProxyService,
    private readonly config: ConfigService,
  ) {}

  @All('*')
  async forward(@Req() req: Request, @Res() res: Response): Promise<void> {
    const base = this.config.get<string>('AUTH_SERVICE_URL')!
    await this.proxy.forward(req, res, `${base}${req.path}`)
  }
}

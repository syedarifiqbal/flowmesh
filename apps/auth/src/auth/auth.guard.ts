import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { AuthService } from './auth.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const authHeader = req.headers['authorization']

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token')
    }

    const token = authHeader.slice(7)
    const payload = this.authService.verifyAccessToken(token)

    // Attach to request for use in controllers
    ;(req as Request & { user: typeof payload }).user = payload
    return true
  }
}

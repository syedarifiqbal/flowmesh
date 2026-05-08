import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { AuthService } from './auth.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()

    const authHeader = req.headers['authorization']
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const payload = this.authService.verifyAccessToken(token)
      ;(req as Request & { user: typeof payload }).user = payload
      return true
    }

    // Gateway-forwarded requests: identity already verified by the gateway
    const workspaceId = req.headers['x-workspace-id'] as string | undefined
    const userId = req.headers['x-user-id'] as string | undefined
    if (workspaceId && userId) {
      ;(req as Request & { user: { sub: string; workspaceId: string; type: 'access' } }).user = {
        sub: userId,
        workspaceId,
        type: 'access',
      }
      return true
    }

    throw new UnauthorizedException('missing authentication credentials')
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Request } from 'express'
import * as crypto from 'crypto'
import { RedisService } from '../redis/redis.service'
import { ProxyService } from '../proxy/proxy.service'

interface AccessTokenPayload {
  sub: string
  workspaceId: string
  jti?: string
  type: 'access'
}

export interface AuthContext {
  userId?: string
  workspaceId: string
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name)

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly proxy: ProxyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const authContext = await this.resolveAuthContext(request)
    ;(request as Request & { auth: AuthContext }).auth = authContext
    return true
  }

  private async resolveAuthContext(request: Request): Promise<AuthContext> {
    const bearer = this.extractBearer(request)
    if (bearer) {
      return this.verifyJwt(bearer)
    }

    const apiKey = request.headers['x-api-key'] as string | undefined
    if (apiKey) {
      return this.verifyApiKey(apiKey)
    }

    throw new UnauthorizedException('missing authentication credentials')
  }

  private extractBearer(request: Request): string | undefined {
    const auth = request.headers.authorization
    if (!auth?.startsWith('Bearer ')) return undefined
    return auth.slice(7)
  }

  private async verifyJwt(token: string): Promise<AuthContext> {
    let payload: AccessTokenPayload
    try {
      payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('invalid access token')
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('invalid token type')
    }

    if (payload.jti) {
      const blacklisted = await this.redis.isJtiBlacklisted(payload.jti)
      if (blacklisted) throw new UnauthorizedException('token has been revoked')
    }

    return { userId: payload.sub, workspaceId: payload.workspaceId }
  }

  private async verifyApiKey(apiKey: string): Promise<AuthContext> {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')

    const blacklisted = await this.redis.isApiKeyBlacklisted(keyHash)
    if (blacklisted) throw new UnauthorizedException('api key has been revoked')

    const workspaceId = await this.proxy.validateApiKey(keyHash)
    if (!workspaceId) throw new UnauthorizedException('invalid api key')

    return { workspaceId }
  }
}

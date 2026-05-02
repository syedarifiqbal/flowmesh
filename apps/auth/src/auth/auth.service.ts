import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'

const BCRYPT_ROUNDS = 12

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

interface AccessTokenPayload {
  sub: string
  workspaceId: string
  type: 'access'
}

interface RefreshTokenPayload {
  sub: string
  jti: string
  type: 'refresh'
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) {
      throw new ConflictException('email already registered')
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    const workspace = await this.prisma.workspace.create({
      data: { name: dto.workspaceName },
    })

    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, workspaceId: workspace.id },
    })

    this.logger.log({ userId: user.id, workspaceId: workspace.id }, 'user registered')
    return this.issueTokenPair(user.id, workspace.id)
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) {
      throw new UnauthorizedException('invalid credentials')
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash)
    if (!passwordMatch) {
      throw new UnauthorizedException('invalid credentials')
    }

    this.logger.log({ userId: user.id }, 'user logged in')
    return this.issueTokenPair(user.id, user.workspaceId)
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload
    try {
      payload = this.jwt.verify<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('invalid refresh token')
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('invalid token type')
    }

    const blacklisted = await this.redis.isTokenBlacklisted(payload.jti)
    if (blacklisted) {
      throw new UnauthorizedException('refresh token revoked')
    }

    const tokenHash = this.hashToken(rawRefreshToken)
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })
    if (!stored || stored.revokedAt) {
      throw new UnauthorizedException('refresh token not found or revoked')
    }

    // Rotate — revoke old token immediately
    const ttl = Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000)
    if (ttl > 0) {
      await this.redis.blacklistToken(payload.jti, ttl)
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } })
    return this.issueTokenPair(user.id, user.workspaceId)
  }

  async logout(rawRefreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload
    try {
      payload = this.jwt.verify<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      })
    } catch {
      // Token is expired or invalid — nothing to revoke
      return
    }

    const tokenHash = this.hashToken(rawRefreshToken)
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })
    if (stored && !stored.revokedAt) {
      const ttl = Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000)
      if (ttl > 0) {
        await this.redis.blacklistToken(payload.jti, ttl)
      }
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      })
    }

    this.logger.log({ userId: payload.sub }, 'user logged out')
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, workspaceId: true, createdAt: true },
    })
    return user
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      })
      if (payload.type !== 'access') {
        throw new UnauthorizedException('invalid token type')
      }
      return payload
    } catch {
      throw new UnauthorizedException('invalid access token')
    }
  }

  private async issueTokenPair(userId: string, workspaceId: string): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub: userId, workspaceId, type: 'access' } satisfies AccessTokenPayload,
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN'),
      },
    )

    const jti = crypto.randomUUID()
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN')!
    const expiresAt = this.parseExpiresAt(expiresIn)

    const rawRefreshToken = this.jwt.sign(
      { sub: userId, jti, type: 'refresh' } satisfies RefreshTokenPayload,
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn,
      },
    )

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt,
      },
    })

    return { accessToken, refreshToken: rawRefreshToken }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  private parseExpiresAt(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn)
    if (!match) throw new Error(`invalid expiresIn format: ${expiresIn}`)
    const value = parseInt(match[1], 10)
    const unit = match[2]
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
    return new Date(Date.now() + value * multipliers[unit] * 1000)
  }
}

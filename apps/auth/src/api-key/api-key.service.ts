import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { CreateApiKeyDto } from './dto/create-api-key.dto'

const KEY_PREFIX = 'fm_'

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(workspaceId: string, dto: CreateApiKeyDto) {
    const rawKey = KEY_PREFIX + crypto.randomBytes(32).toString('hex')
    const keyHash = this.hashKey(rawKey)
    const keyPrefix = rawKey.slice(0, 11)

    const record = await this.prisma.apiKey.create({
      data: { workspaceId, name: dto.name, keyHash, keyPrefix },
    })

    this.logger.log({ keyId: record.id, workspaceId }, 'api key created')

    return {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      createdAt: record.createdAt,
      // plaintext returned once — never stored
      key: rawKey,
    }
  }

  async list(workspaceId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return keys
  }

  async revoke(workspaceId: string, id: string): Promise<void> {
    const key = await this.prisma.apiKey.findFirst({ where: { id, workspaceId } })
    if (!key) {
      throw new NotFoundException('api key not found')
    }

    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    })

    // Add to Redis 2 blacklist — immediate effect, no TTL (revoked forever)
    await this.redis.blacklistApiKey(key.keyHash)
    this.logger.log({ keyId: id, workspaceId }, 'api key revoked')
  }

  async validateApiKey(rawKey: string): Promise<{ workspaceId: string } | null> {
    const keyHash = this.hashKey(rawKey)

    const blacklisted = await this.redis.isApiKeyBlacklisted(keyHash)
    if (blacklisted) return null

    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      select: { workspaceId: true, revokedAt: true },
    })

    if (!key || key.revokedAt) return null
    return { workspaceId: key.workspaceId }
  }

  private hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex')
  }
}

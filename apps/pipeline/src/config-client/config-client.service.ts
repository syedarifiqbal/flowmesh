import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import CircuitBreaker from 'opossum'
import { Pipeline } from '@flowmesh/shared-types'
import { CacheKeyFactory } from '@flowmesh/nestjs-common'
import { RedisService, PIPELINE_CONFIG_CACHE_TTL } from '../redis/redis.service'

const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
}

@Injectable()
export class ConfigClientService implements OnModuleInit {
  private readonly logger = new Logger(ConfigClientService.name)
  private circuitBreaker!: CircuitBreaker<[string], Pipeline[]>

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly cacheKey: CacheKeyFactory,
  ) {}

  onModuleInit() {
    this.circuitBreaker = new CircuitBreaker(
      (workspaceId: string) => this.fetchPipelinesFromService(workspaceId),
      CIRCUIT_BREAKER_OPTIONS,
    )

    this.circuitBreaker.on('open', () =>
      this.logger.warn('circuit breaker opened — config-service is unavailable'),
    )
    this.circuitBreaker.on('halfOpen', () =>
      this.logger.log('circuit breaker half-open — testing config-service'),
    )
    this.circuitBreaker.on('close', () =>
      this.logger.log('circuit breaker closed — config-service recovered'),
    )
  }

  async getPipelinesForWorkspace(workspaceId: string): Promise<Pipeline[]> {
    const key = this.cacheKey.list(workspaceId)

    const cached = await this.redis.get(key)
    if (cached) {
      return JSON.parse(cached) as Pipeline[]
    }

    const pipelines = await this.circuitBreaker.fire(workspaceId)
    await this.redis.set(key, JSON.stringify(pipelines), PIPELINE_CONFIG_CACHE_TTL)

    return pipelines
  }

  async invalidateWorkspaceCache(workspaceId: string): Promise<void> {
    await this.redis.del(this.cacheKey.list(workspaceId))
  }

  private async fetchPipelinesFromService(workspaceId: string): Promise<Pipeline[]> {
    const baseUrl = this.config.get<string>('CONFIG_SERVICE_URL')!
    const url = `${baseUrl}/pipelines`

    const response = await fetch(url, {
      headers: { 'x-workspace-id': workspaceId },
      signal: AbortSignal.timeout(CIRCUIT_BREAKER_OPTIONS.timeout),
    })

    if (!response.ok) {
      throw new Error(`config-service responded with ${response.status} for workspaceId=${workspaceId}`)
    }

    return (await response.json()) as Pipeline[]
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import CircuitBreaker from 'opossum'
import { Pipeline } from '@flowmesh/shared-types'

const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
}

// No local Redis cache here — the config-service already caches pipeline
// definitions in Redis 1. A second cache layer here caused stale reads after
// pipeline updates because only the config-service's cache was invalidated on
// writes, not this one. Rely on the config-service circuit breaker + its own
// cache-aside layer instead.
@Injectable()
export class ConfigClientService implements OnModuleInit {
  private readonly logger = new Logger(ConfigClientService.name)
  private circuitBreaker!: CircuitBreaker<[string], Pipeline[]>

  constructor(private readonly config: ConfigService) {}

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
    return this.circuitBreaker.fire(workspaceId)
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

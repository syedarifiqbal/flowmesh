import { DynamicModule, Module } from '@nestjs/common'
import { CacheKeyFactory } from './cache-key.factory'

export const CACHE_SERVICE_NAME = 'CACHE_SERVICE_NAME'

@Module({})
export class CacheKeyModule {
  /**
   * Register once in AppModule. Stores the service name globally so every
   * forFeature() call in any module of this service can read it.
   *
   * @example
   * CacheKeyModule.forRoot({ service: 'config' })
   */
  static forRoot(options: { service: string }): DynamicModule {
    return {
      module: CacheKeyModule,
      global: true,
      providers: [{ provide: CACHE_SERVICE_NAME, useValue: options.service }],
      exports: [CACHE_SERVICE_NAME],
    }
  }

  /**
   * Register in a feature module. Provides a CacheKeyFactory pre-scoped to
   * this domain. Inject CacheKeyFactory directly — no string token needed.
   *
   * @example
   * // pipeline.module.ts
   * imports: [CacheKeyModule.forFeature({ domain: 'pipeline' })]
   *
   * // pipeline.service.ts
   * constructor(private readonly cacheKey: CacheKeyFactory) {}
   * this.cacheKey.one(id, workspaceId) // → 'config:pipeline:ws-123:abc'
   */
  static forFeature(options: { domain: string }): DynamicModule {
    return {
      module: CacheKeyModule,
      providers: [
        {
          provide: CacheKeyFactory,
          useFactory: (serviceName: string) => new CacheKeyFactory(serviceName, options.domain),
          inject: [CACHE_SERVICE_NAME],
        },
      ],
      exports: [CacheKeyFactory],
    }
  }
}

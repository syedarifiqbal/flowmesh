# @flowmesh/nestjs-common

Shared NestJS infrastructure for FlowMesh services.

## Exports

- `HttpExceptionFilter`
- `CorrelationIdMiddleware`
- `CORRELATION_ID_HEADER`
- `HealthModule`
- `HealthController`
- `CacheKeyModule`
- `CacheKeyFactory`
- `CACHE_SERVICE_NAME`
- `RabbitMqModule`
- `RabbitMqConnection`
- `RABBITMQ_OPTIONS`
- `RabbitMqOptions`

## Install in a service

Add the workspace dependency:

```json
{
  "dependencies": {
    "@flowmesh/nestjs-common": "workspace:*"
  }
}
```

After any change in this package, rebuild it before running a service:

```bash
pnpm --filter @flowmesh/nestjs-common build
```

## HttpExceptionFilter

Use `HttpExceptionFilter` as the global exception filter so every service returns the same JSON error envelope and logs with `correlationId` context.

```ts
import { Module } from '@nestjs/common'
import { HttpExceptionFilter } from '@flowmesh/nestjs-common'

@Module({
  providers: [HttpExceptionFilter],
})
export class AppModule {}
```

```ts
import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'
import { HttpExceptionFilter } from '@flowmesh/nestjs-common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useLogger(app.get(Logger))
  app.useGlobalFilters(app.get(HttpExceptionFilter))

  await app.listen(3000)
}

void bootstrap()
```

## CorrelationIdMiddleware and CORRELATION_ID_HEADER

Use `CorrelationIdMiddleware` on all routes. It reads `x-correlation-id` from the request if present, otherwise generates one, then echoes it on the response.

```ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { CorrelationIdMiddleware } from '@flowmesh/nestjs-common'

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}
```

Use `CORRELATION_ID_HEADER` anywhere the service needs the header name, for example in `nestjs-pino` custom props.

```ts
import { LoggerModule } from 'nestjs-pino'
import { CORRELATION_ID_HEADER } from '@flowmesh/nestjs-common'

LoggerModule.forRoot({
  pinoHttp: {
    customProps: (req) => ({
      service: 'config-service',
      correlationId: req.headers[CORRELATION_ID_HEADER],
    }),
  },
})
```

## HealthModule and HealthController

Import `HealthModule` into the root module of a service to expose `GET /health` returning `{ status: 'ok' }`.

```ts
import { Module } from '@nestjs/common'
import { HealthModule } from '@flowmesh/nestjs-common'

@Module({
  imports: [HealthModule],
})
export class AppModule {}
```

`HealthController` is exported for completeness, but most services should import `HealthModule` instead of registering the controller directly.

## CacheKeyModule, CacheKeyFactory, and CACHE_SERVICE_NAME

Use `CacheKeyModule.forRoot()` once in the root module to register the service name globally.

```ts
import { Module } from '@nestjs/common'
import { CacheKeyModule } from '@flowmesh/nestjs-common'

@Module({
  imports: [CacheKeyModule.forRoot({ service: 'config' })],
})
export class AppModule {}
```

Use `CacheKeyModule.forFeature()` in each feature module that needs cache keys for a domain.

```ts
import { Module } from '@nestjs/common'
import { CacheKeyModule } from '@flowmesh/nestjs-common'
import { PipelineService } from './pipeline.service'

@Module({
  imports: [CacheKeyModule.forFeature({ domain: 'pipeline' })],
  providers: [PipelineService],
})
export class PipelineModule {}
```

Inject `CacheKeyFactory` in the service and generate keys there.

```ts
import { Injectable } from '@nestjs/common'
import { CacheKeyFactory } from '@flowmesh/nestjs-common'

@Injectable()
export class PipelineService {
  constructor(private readonly cacheKey: CacheKeyFactory) {}

  listKey(workspaceId: string) {
    return this.cacheKey.list(workspaceId)
  }

  oneKey(id: string, workspaceId: string) {
    return this.cacheKey.one(id, workspaceId)
  }
}
```

`CACHE_SERVICE_NAME` is the injection token that backs the global service name provider. You usually do not inject it directly, but it is exported for advanced module wiring and tests.

### forRoot + forFeature pattern

`forRoot()` sets the service prefix once for the whole app. `forFeature()` uses that service prefix to create a domain-scoped `CacheKeyFactory`.

```ts
// app.module.ts
@Module({
  imports: [
    CacheKeyModule.forRoot({ service: 'config' }),
    PipelineModule,
    DestinationModule,
  ],
})
export class AppModule {}

// pipeline.module.ts
@Module({
  imports: [CacheKeyModule.forFeature({ domain: 'pipeline' })],
})
export class PipelineModule {}

// destination.module.ts
@Module({
  imports: [CacheKeyModule.forFeature({ domain: 'destination' })],
})
export class DestinationModule {}
```

With that setup, injected factories generate keys like:

- `config:pipeline:ws-123:list`
- `config:pipeline:ws-123:abc-def`
- `config:destination:ws-123:list`

## RabbitMqModule, RabbitMqConnection, RABBITMQ_OPTIONS, and RabbitMqOptions

Use `RabbitMqModule.forRootAsync()` once in the root module to register a shared RabbitMQ connection globally. The async registration pattern matches `CacheKeyModule`: configure it once in `app.module.ts`, then inject `RabbitMqConnection` anywhere a service needs an AMQP connection or channel.

```ts
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { RabbitMqModule } from '@flowmesh/nestjs-common'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RabbitMqModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('RABBITMQ_URL'),
        exchange: config.get<string>('RABBITMQ_EXCHANGE') ?? 'flowmesh',
        prefetch: Number(config.get<string>('RABBITMQ_PREFETCH') ?? '10'),
      }),
    }),
  ],
})
export class AppModule {}
```

`RabbitMqOptions` is the options shape returned by the async factory, and `RABBITMQ_OPTIONS` is the injection token behind that configuration for advanced tests or custom module wiring. Most services should not inject the token directly.

Inject `RabbitMqConnection` into the service that needs a connection or channel.

```ts
import { Injectable } from '@nestjs/common'
import { RabbitMqConnection } from '@flowmesh/nestjs-common'

@Injectable()
export class EventPublisher {
  constructor(private readonly rabbitMq: RabbitMqConnection) {}

  async publishRoutingKey(routingKey: string, payload: Record<string, unknown>) {
    const connection = this.rabbitMq.getConnection()
    const channel = await connection.createChannel()

    await channel.publish(
      'flowmesh',
      routingKey,
      Buffer.from(JSON.stringify(payload)),
    )

    await channel.close()
  }
}
```

`RabbitMqConnection` owns the shared AMQP connection lifecycle for the app. It connects during module startup, closes cleanly during shutdown, and exposes the underlying connection through `getConnection()` so higher-level services can create channels when needed.

## Logger constraint inside this package

Never use `@InjectPinoLogger` inside `@flowmesh/nestjs-common`.

This package is compiled and imported like an external dependency. `LoggerModule` only scans the host service's module graph when it registers named logger providers. Classes inside this compiled package are outside that graph, so `@InjectPinoLogger` would create a NestJS dependency resolution error at startup.

Inside this package, always use the standard NestJS logger instead:

```ts
import { Logger } from '@nestjs/common'

private readonly logger = new Logger(HttpExceptionFilter.name)
```

Once the host service calls `app.useLogger(app.get(Logger))`, the output still flows through pino.

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { AppConfigModule } from './config/config.module'
import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { ConfigClientModule } from './config-client/config-client.module'
import { StepsModule } from './steps/steps.module'
import { FanoutModule } from './fanout/fanout.module'
import { ConsumerModule } from './consumer/consumer.module'
import {
  HealthModule,
  HttpExceptionFilter,
  CorrelationIdMiddleware,
  CORRELATION_ID_HEADER,
  RabbitMqModule,
  CacheKeyModule,
} from '@flowmesh/nestjs-common'

const isDev = process.env.NODE_ENV !== 'production'

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: isDev ? 'debug' : 'info',
        transport: isDev
          ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
          : undefined,
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => ({
          service: 'pipeline',
          correlationId: req.headers[CORRELATION_ID_HEADER],
        }),
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      },
    }),
    CacheKeyModule.forRoot({ service: 'pipeline' }),
    // RabbitMqModule MUST come before FanoutModule and ConsumerModule.
    // NestJS calls onModuleInit in insertion order within the same distance level.
    // FanoutService and ConsumerService call getConnection() in their onModuleInit,
    // so RabbitMqConnection must be connected first.
    RabbitMqModule.forRootAsync({
      useFactory: (config: ConfigService) => ({ url: config.get<string>('RABBITMQ_URL')! }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    ConfigClientModule,
    StepsModule,
    FanoutModule,
    ConsumerModule,
    HealthModule,
  ],
  providers: [HttpExceptionFilter],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { AppConfigModule } from './config/config.module'
import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { EncryptionModule } from './encryption/encryption.module'
import { PipelineModule } from './pipeline/pipeline.module'
import { DestinationModule } from './destination/destination.module'
import { HealthModule, HttpExceptionFilter, CorrelationIdMiddleware, CORRELATION_ID_HEADER } from '@flowmesh/nestjs-common'

const isDev = process.env.NODE_ENV !== 'production'

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: isDev ? 'debug' : 'info',
        transport: isDev ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } } : undefined,
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => ({
          service: 'config-service',
          correlationId: req.headers[CORRELATION_ID_HEADER],
        }),
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      },
    }),
    PrismaModule,
    RedisModule,
    EncryptionModule,
    PipelineModule,
    DestinationModule,
    HealthModule,
  ],
  providers: [HttpExceptionFilter],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}

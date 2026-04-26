import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { AppConfigModule } from './config/config.module'
import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { EncryptionModule } from './encryption/encryption.module'
import { PipelineModule } from './pipeline/pipeline.module'
import { DestinationModule } from './destination/destination.module'
import { HealthModule } from './health/health.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { CorrelationIdMiddleware, CORRELATION_ID_HEADER } from './common/middleware/correlation-id.middleware'

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        customProps: (req) => ({
          service: 'config-service',
          correlationId: req.headers[CORRELATION_ID_HEADER],
        }),
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

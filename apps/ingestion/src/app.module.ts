import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { AppConfigModule } from './config/config.module'
import { PrismaModule } from './prisma/prisma.module'
import { RabbitMQModule } from './rabbitmq/rabbitmq.module'
import { RedisModule } from './redis/redis.module'
import { IngestionModule } from './ingestion/ingestion.module'
import { HealthModule } from './health/health.module'

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
        customProps: () => ({ service: 'ingestion' }),
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      },
    }),
    PrismaModule,
    RabbitMQModule,
    RedisModule,
    IngestionModule,
    HealthModule,
  ],
})
export class AppModule {}

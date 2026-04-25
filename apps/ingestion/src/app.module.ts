import { Module } from '@nestjs/common'
import { AppConfigModule } from './config/config.module'
import { PrismaModule } from './prisma/prisma.module'
import { RabbitMQModule } from './rabbitmq/rabbitmq.module'
import { RedisModule } from './redis/redis.module'
import { IngestionModule } from './ingestion/ingestion.module'
import { HealthModule } from './health/health.module'

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RabbitMQModule,
    RedisModule,
    IngestionModule,
    HealthModule,
  ],
})
export class AppModule {}

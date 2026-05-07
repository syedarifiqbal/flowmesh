import { Module, Global } from '@nestjs/common'
import { RedisService } from './redis.service'
import { RedisPubSubService } from './redis-pubsub.service'

@Global()
@Module({
  providers: [RedisService, RedisPubSubService],
  exports: [RedisService, RedisPubSubService],
})
export class RedisModule {}

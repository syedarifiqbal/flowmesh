import { Module } from '@nestjs/common'
import { RedisModule } from '../redis/redis.module'
import { RateLimitGuard } from './rate-limit.guard'

@Module({
  imports: [RedisModule],
  providers: [RateLimitGuard],
  exports: [RateLimitGuard],
})
export class RateLimitModule {}

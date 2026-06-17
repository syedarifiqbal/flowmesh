import { Module, Global } from '@nestjs/common'
import { AlertRedisService } from './redis.service'

@Global()
@Module({
  providers: [AlertRedisService],
  exports: [AlertRedisService],
})
export class AlertRedisModule {}

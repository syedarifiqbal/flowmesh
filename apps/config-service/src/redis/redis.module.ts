import { Module, Global } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { RedisService } from './redis.service'

@Global()
@Module({
  imports: [LoggerModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

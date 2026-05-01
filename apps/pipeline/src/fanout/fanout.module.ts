import { Module, Global } from '@nestjs/common'
import { FanoutService } from './fanout.service'

@Global()
@Module({
  providers: [FanoutService],
  exports: [FanoutService],
})
export class FanoutModule {}

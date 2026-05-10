import { Module, Global } from '@nestjs/common'
import { ConfigClientService } from './config-client.service'

@Global()
@Module({
  providers: [ConfigClientService],
  exports: [ConfigClientService],
})
export class ConfigClientModule {}

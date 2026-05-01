import { Module, Global } from '@nestjs/common'
import { ConfigClientService } from './config-client.service'
import { CacheKeyModule } from '@flowmesh/nestjs-common'

@Global()
@Module({
  imports: [CacheKeyModule.forFeature({ domain: 'config' })],
  providers: [ConfigClientService],
  exports: [ConfigClientService],
})
export class ConfigClientModule {}

import { Module } from '@nestjs/common'
import { ManagementController } from './management.controller'
import { PublicAuthController } from './public-auth.controller'
import { AuthModule } from '../auth/auth.module'
import { RateLimitModule } from '../rate-limit/rate-limit.module'
import { ProxyModule } from '../proxy/proxy.module'

@Module({
  imports: [AuthModule, RateLimitModule, ProxyModule],
  controllers: [ManagementController, PublicAuthController],
})
export class ManagementModule {}

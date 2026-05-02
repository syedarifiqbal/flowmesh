import { Module } from '@nestjs/common'
import { IngestController } from './ingest.controller'
import { AuthModule } from '../auth/auth.module'
import { RateLimitModule } from '../rate-limit/rate-limit.module'
import { ProxyModule } from '../proxy/proxy.module'

@Module({
  imports: [AuthModule, RateLimitModule, ProxyModule],
  controllers: [IngestController],
})
export class IngestModule {}

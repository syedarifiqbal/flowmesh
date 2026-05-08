import { Module } from '@nestjs/common'
import { ApiKeyService } from './api-key.service'
import { ApiKeyController } from './api-key.controller'
import { InternalApiKeyController } from './internal-api-key.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  providers: [ApiKeyService],
  controllers: [ApiKeyController, InternalApiKeyController],
})
export class ApiKeyModule {}

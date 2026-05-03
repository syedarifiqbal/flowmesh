import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { RedisModule } from '../redis/redis.module'
import { ProxyModule } from '../proxy/proxy.module'
import { AuthGuard } from './auth.guard'

@Module({
  imports: [JwtModule.register({}), RedisModule, ProxyModule],
  providers: [AuthGuard],
  exports: [AuthGuard, JwtModule, RedisModule],
})
export class AuthModule {}

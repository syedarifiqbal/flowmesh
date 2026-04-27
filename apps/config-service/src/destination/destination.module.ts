import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { CacheKeyModule } from '@flowmesh/nestjs-common'
import { DestinationController } from './destination.controller'
import { DestinationService } from './destination.service'

@Module({
  imports: [LoggerModule, CacheKeyModule.forFeature({ domain: 'destination' })],
  controllers: [DestinationController],
  providers: [DestinationService],
  exports: [DestinationService],
})
export class DestinationModule {}

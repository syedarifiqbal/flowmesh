import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { CacheKeyModule } from '@flowmesh/nestjs-common'
import { DestinationController } from './destination.controller'
import { InternalDestinationController } from './internal-destination.controller'
import { DestinationService } from './destination.service'

@Module({
  imports: [LoggerModule, CacheKeyModule.forFeature({ domain: 'destination' })],
  controllers: [DestinationController, InternalDestinationController],
  providers: [DestinationService],
  exports: [DestinationService],
})
export class DestinationModule {}

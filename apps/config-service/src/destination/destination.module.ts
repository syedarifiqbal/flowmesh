import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { DestinationController } from './destination.controller'
import { DestinationService } from './destination.service'

@Module({
  imports: [LoggerModule],
  controllers: [DestinationController],
  providers: [DestinationService],
  exports: [DestinationService],
})
export class DestinationModule {}

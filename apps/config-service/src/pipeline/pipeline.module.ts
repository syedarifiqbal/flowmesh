import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { PipelineController } from './pipeline.controller'
import { PipelineService } from './pipeline.service'

@Module({
  imports: [LoggerModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}

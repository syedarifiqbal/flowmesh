import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { CacheKeyModule } from '@flowmesh/nestjs-common'
import { PipelineController } from './pipeline.controller'
import { PipelineService } from './pipeline.service'

@Module({
  imports: [LoggerModule, CacheKeyModule.forFeature({ domain: 'pipeline' })],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}

import { Module, Global } from '@nestjs/common'
import { FilterStepExecutor } from './filter/filter-step.executor'
import { TransformStepExecutor } from './transform/transform-step.executor'
import { EnrichStepExecutor } from './enrich/enrich-step.executor'

@Global()
@Module({
  providers: [FilterStepExecutor, TransformStepExecutor, EnrichStepExecutor],
  exports: [FilterStepExecutor, TransformStepExecutor, EnrichStepExecutor],
})
export class StepsModule {}

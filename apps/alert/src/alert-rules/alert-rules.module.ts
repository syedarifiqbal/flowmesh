import { Module, forwardRef } from '@nestjs/common'
import { AlertRulesService } from './alert-rules.service'
import { AlertRulesController } from './alert-rules.controller'
import { EvaluatorModule } from '../evaluator/evaluator.module'

@Module({
  imports: [forwardRef(() => EvaluatorModule)],
  controllers: [AlertRulesController],
  providers: [AlertRulesService],
  exports: [AlertRulesService],
})
export class AlertRulesModule {}

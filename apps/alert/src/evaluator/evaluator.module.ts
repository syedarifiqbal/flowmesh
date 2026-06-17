import { Module, forwardRef } from '@nestjs/common'
import { EvaluatorService } from './evaluator.service'
import { AlertRulesModule } from '../alert-rules/alert-rules.module'
import { SlackNotifier } from '../notifiers/slack.notifier'
import { WebhookNotifier } from '../notifiers/webhook.notifier'
import { EmailNotifier } from '../notifiers/email.notifier'
import { AlertRedisModule } from '../redis/redis.module'

@Module({
  imports: [forwardRef(() => AlertRulesModule), AlertRedisModule],
  providers: [EvaluatorService, SlackNotifier, WebhookNotifier, EmailNotifier],
  exports: [EvaluatorService],
})
export class EvaluatorModule {}

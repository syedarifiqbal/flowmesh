import { Injectable, Logger } from '@nestjs/common'
import { AlertRulesService } from '../alert-rules/alert-rules.service'
import { SlackNotifier } from '../notifiers/slack.notifier'
import { WebhookNotifier } from '../notifiers/webhook.notifier'
import { EmailNotifier } from '../notifiers/email.notifier'
import { AlertRedisService } from '../redis/redis.service'

export interface IngestedEvent {
  eventId?: string
  eventName: string
  workspaceId: string
  userId?: string
  anonymousId?: string
  properties?: Record<string, unknown>
  context?: Record<string, unknown>
}

type EvaluableRule = {
  id: string
  conditionType: string
  eventName: string | null
  propertyPath: string | null
  propertyValue: string | null
  thresholdCount: number | null
  windowSeconds: number | null
  channel: string
  name: string
  slackWebhookUrl: string | null
  webhookUrl: string | null
  recipientEmail: string | null
}

@Injectable()
export class EvaluatorService {
  private readonly logger = new Logger(EvaluatorService.name)

  constructor(
    private readonly rulesService: AlertRulesService,
    private readonly slack: SlackNotifier,
    private readonly webhook: WebhookNotifier,
    private readonly email: EmailNotifier,
    private readonly redis: AlertRedisService,
  ) {}

  async evaluate(event: IngestedEvent): Promise<void> {
    const rules = await this.rulesService.findEnabledRulesForWorkspace(event.workspaceId)

    for (const rule of rules) {
      const matched = await this.matches(rule, event)
      if (!matched) continue

      const triggeredAt = new Date().toISOString()
      const properties = event.properties ?? {}

      let notificationStatus: 'sent' | 'failed' = 'sent'
      let notificationError: string | undefined

      try {
        await this.notify(rule, event, properties, triggeredAt)
      } catch (err: unknown) {
        notificationStatus = 'failed'
        notificationError = err instanceof Error ? err.message : String(err)
        this.logger.error({ ruleId: rule.id, err }, 'notification failed')
      }

      await this.rulesService.recordHistory({
        workspaceId: event.workspaceId,
        ruleId: rule.id,
        eventId: event.eventId,
        eventName: event.eventName,
        eventPayload: properties,
        notificationStatus,
        notificationError,
      })
    }
  }

  private async notify(
    rule: EvaluableRule,
    event: IngestedEvent,
    properties: Record<string, unknown>,
    triggeredAt: string,
  ): Promise<void> {
    if (rule.channel === 'slack' && rule.slackWebhookUrl) {
      await this.slack.send({
        webhookUrl: rule.slackWebhookUrl,
        ruleName: rule.name,
        eventName: event.eventName,
        eventId: event.eventId,
        properties,
        workspaceId: event.workspaceId,
      })
    } else if (rule.channel === 'webhook' && rule.webhookUrl) {
      await this.webhook.send({
        webhookUrl: rule.webhookUrl,
        ruleName: rule.name,
        ruleId: rule.id,
        eventName: event.eventName,
        eventId: event.eventId,
        properties,
        workspaceId: event.workspaceId,
        triggeredAt,
      })
    } else if (rule.channel === 'email' && rule.recipientEmail) {
      await this.email.send({
        recipientEmail: rule.recipientEmail,
        ruleName: rule.name,
        eventName: event.eventName,
        eventId: event.eventId,
        properties,
        workspaceId: event.workspaceId,
        triggeredAt,
      })
    }
  }

  // Used by the test endpoint — sends a test notification with synthetic data
  async sendTestNotification(rule: EvaluableRule): Promise<void> {
    const triggeredAt = new Date().toISOString()
    const properties = { test: true, source: 'flowmesh-test' }
    await this.notify(
      rule,
      { eventName: rule.eventName ?? 'test.event', workspaceId: rule.id, eventId: 'test-event-id' },
      properties,
      triggeredAt,
    )
  }

  private async matches(rule: EvaluableRule, event: IngestedEvent): Promise<boolean> {
    if (rule.eventName && rule.eventName !== event.eventName) return false

    if (rule.conditionType === 'any_event') return true

    if (rule.conditionType === 'property_equals') {
      if (!rule.propertyPath || rule.propertyValue === null) return false
      const value = this.getNestedValue(event.properties ?? {}, rule.propertyPath)
      return String(value) === rule.propertyValue
    }

    if (rule.conditionType === 'count_threshold') {
      return this.checkCountThreshold(rule, event)
    }

    return false
  }

  private async checkCountThreshold(rule: EvaluableRule, _event: IngestedEvent): Promise<boolean> {
    if (!rule.thresholdCount || !rule.windowSeconds) return false

    const bucket = Math.floor(Date.now() / 1000 / rule.windowSeconds)
    const countKey = `alert:count:${rule.id}:${bucket}`
    const firedKey = `alert:fired:${rule.id}:${bucket}`
    const ttl = rule.windowSeconds * 2

    const count = await this.redis.incr(countKey)
    if (count === 1) await this.redis.expire(countKey, ttl)

    if (count < rule.thresholdCount) return false

    // Fire only once per window — NX means "only set if not exists"
    const didSet = await this.redis.setNx(firedKey, '1', ttl)
    return didSet === 'OK'
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        return (current as Record<string, unknown>)[key]
      }
      return undefined
    }, obj)
  }
}

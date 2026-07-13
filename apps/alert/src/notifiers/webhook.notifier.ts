import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

export interface WebhookNotifyParams {
  webhookUrl: string
  ruleName: string
  ruleId: string
  eventName: string | undefined
  eventId: string | undefined
  properties: Record<string, unknown>
  workspaceId: string
  triggeredAt: string
}

@Injectable()
export class WebhookNotifier {
  private readonly logger = new Logger(WebhookNotifier.name)

  async send(params: WebhookNotifyParams): Promise<void> {
    const payload = {
      source: 'flowmesh',
      alert: {
        ruleId: params.ruleId,
        ruleName: params.ruleName,
      },
      event: {
        id: params.eventId,
        name: params.eventName,
        properties: params.properties,
      },
      workspaceId: params.workspaceId,
      triggeredAt: params.triggeredAt,
    }

    await axios.post(params.webhookUrl, payload, {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/json' },
    })
    this.logger.log({ ruleName: params.ruleName }, 'webhook notification sent')
  }
}

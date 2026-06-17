import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

export interface SlackNotifyParams {
  webhookUrl: string
  ruleName: string
  eventName: string | undefined
  eventId: string | undefined
  properties: Record<string, unknown>
  workspaceId: string
}

@Injectable()
export class SlackNotifier {
  private readonly logger = new Logger(SlackNotifier.name)

  async send(params: SlackNotifyParams): Promise<void> {
    const eventLabel = params.eventName ?? 'unknown'
    const propLines = Object.entries(params.properties)
      .slice(0, 6)
      .map(([k, v]) => `• *${k}*: ${String(v)}`)
      .join('\n')

    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🔔 FlowMesh Alert: ${params.ruleName}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Event*\n\`${eventLabel}\`` },
            { type: 'mrkdwn', text: `*Workspace*\n${params.workspaceId}` },
          ],
        },
        ...(propLines
          ? [{
              type: 'section',
              text: { type: 'mrkdwn', text: `*Properties*\n${propLines}` },
            }]
          : []),
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Event ID: ${params.eventId ?? 'n/a'}` },
          ],
        },
      ],
    }

    await axios.post(params.webhookUrl, payload, { timeout: 10_000 })
    this.logger.log({ ruleName: params.ruleName }, 'slack notification sent')
  }
}

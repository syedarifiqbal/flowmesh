import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer from 'nodemailer'

export interface EmailNotifyParams {
  recipientEmail: string
  ruleName: string
  eventName: string | undefined
  eventId: string | undefined
  properties: Record<string, unknown>
  workspaceId: string
  triggeredAt: string
}

@Injectable()
export class EmailNotifier {
  private readonly logger = new Logger(EmailNotifier.name)

  constructor(private readonly config: ConfigService) {}

  async send(params: EmailNotifyParams): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST')
    if (!host) throw new Error('SMTP_HOST is not configured')

    const transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('SMTP_PORT'),
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    })

    const eventLabel = params.eventName ?? 'unknown'
    const propRows = Object.entries(params.properties)
      .slice(0, 10)
      .map(([k, v]) => `<tr><td style="padding:4px 8px;color:#6b7280">${k}</td><td style="padding:4px 8px;font-weight:600">${String(v)}</td></tr>`)
      .join('')

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5;margin-bottom:4px">🔔 FlowMesh Alert</h2>
        <p style="color:#374151;margin-top:0"><strong>${params.ruleName}</strong></p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 8px;color:#6b7280">Event</td><td style="padding:4px 8px;font-family:monospace;font-weight:600">${eventLabel}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280">Workspace</td><td style="padding:4px 8px">${params.workspaceId}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280">Fired at</td><td style="padding:4px 8px">${params.triggeredAt}</td></tr>
          ${propRows}
        </table>
        <p style="color:#9ca3af;font-size:12px">Sent by FlowMesh alert engine · Event ID: ${params.eventId ?? 'n/a'}</p>
      </div>
    `

    await transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM'),
      to: params.recipientEmail,
      subject: `[FlowMesh] Alert: ${params.ruleName} — ${eventLabel}`,
      html,
    })

    this.logger.log({ ruleName: params.ruleName, to: params.recipientEmail }, 'email notification sent')
  }
}

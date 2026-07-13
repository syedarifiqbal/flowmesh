import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto'
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto'
import { QueryHistoryDto } from './dto/query-history.dto'

@Injectable()
export class AlertRulesService {
  private readonly logger = new Logger(AlertRulesService.name)

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAlertRuleDto, workspaceId: string) {
    const rule = await this.prisma.alertRule.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled ?? true,
        conditionType: dto.conditionType,
        eventName: dto.eventName ?? null,
        propertyPath: dto.propertyPath ?? null,
        propertyValue: dto.propertyValue ?? null,
        thresholdCount: dto.thresholdCount ?? null,
        windowSeconds: dto.windowSeconds ?? null,
        channel: dto.channel,
        webhookUrl: dto.webhookUrl ?? null,
        slackWebhookUrl: dto.slackWebhookUrl ?? null,
        recipientEmail: dto.recipientEmail ?? null,
      },
    })
    this.logger.log({ ruleId: rule.id, name: rule.name }, 'alert rule created')
    return rule
  }

  async findAll(workspaceId: string) {
    return this.prisma.alertRule.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string, workspaceId: string) {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id, workspaceId },
    })
    if (!rule) throw new NotFoundException(`Alert rule ${id} not found`)
    return rule
  }

  async update(id: string, dto: UpdateAlertRuleDto, workspaceId: string) {
    await this.findOne(id, workspaceId)
    return this.prisma.alertRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.conditionType !== undefined && { conditionType: dto.conditionType }),
        ...(dto.eventName !== undefined && { eventName: dto.eventName }),
        ...(dto.propertyPath !== undefined && { propertyPath: dto.propertyPath }),
        ...(dto.propertyValue !== undefined && { propertyValue: dto.propertyValue }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.thresholdCount !== undefined && { thresholdCount: dto.thresholdCount }),
        ...(dto.windowSeconds !== undefined && { windowSeconds: dto.windowSeconds }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
        ...(dto.slackWebhookUrl !== undefined && { slackWebhookUrl: dto.slackWebhookUrl }),
        ...(dto.recipientEmail !== undefined && { recipientEmail: dto.recipientEmail }),
      },
    })
  }

  async remove(id: string, workspaceId: string) {
    await this.findOne(id, workspaceId)
    await this.prisma.alertRule.delete({ where: { id } })
  }

  async toggle(id: string, workspaceId: string) {
    const rule = await this.findOne(id, workspaceId)
    return this.prisma.alertRule.update({
      where: { id },
      data: { enabled: !rule.enabled },
    })
  }

  async findHistory(workspaceId: string, query: QueryHistoryDto) {
    const where = {
      workspaceId,
      ...(query.ruleId && { ruleId: query.ruleId }),
    }

    const [items, total] = await Promise.all([
      this.prisma.alertHistory.findMany({
        where,
        orderBy: { triggeredAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: { rule: { select: { name: true, channel: true } } },
      }),
      this.prisma.alertHistory.count({ where }),
    ])

    return { items, total }
  }

  // Called by the evaluator — internal, not exposed via HTTP
  async recordHistory(params: {
    workspaceId: string
    ruleId: string
    eventId: string | undefined
    eventName: string | undefined
    eventPayload: Record<string, unknown>
    notificationStatus: 'sent' | 'failed'
    notificationError?: string
  }) {
    return this.prisma.alertHistory.create({
      data: {
        workspaceId: params.workspaceId,
        ruleId: params.ruleId,
        eventId: params.eventId,
        eventName: params.eventName,
        // Prisma JSON columns require casting via Prisma.InputJsonValue
        eventPayload: params.eventPayload as object,
        notificationStatus: params.notificationStatus,
        notificationError: params.notificationError,
      },
    })
  }

  async findEnabledRulesForWorkspace(workspaceId: string) {
    return this.prisma.alertRule.findMany({
      where: { workspaceId, enabled: true },
    })
  }
}

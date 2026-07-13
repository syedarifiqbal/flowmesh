import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { AlertRulesService } from './alert-rules.service'
import { PrismaService } from '../prisma/prisma.service'
import { ConditionType, AlertChannel } from './dto/create-alert-rule.dto'

const WORKSPACE_ID = 'ws-test'
const RULE_ID = 'rule-uuid-1'

const baseRule = {
  id: RULE_ID,
  workspaceId: WORKSPACE_ID,
  name: 'Payment Failures',
  description: null,
  enabled: true,
  conditionType: ConditionType.ANY_EVENT,
  eventName: 'payment.failed',
  propertyPath: null,
  propertyValue: null,
  channel: AlertChannel.SLACK,
  slackWebhookUrl: 'https://hooks.slack.com/test',
  webhookUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('AlertRulesService', () => {
  let service: AlertRulesService
  let prisma: {
    alertRule: {
      create: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
    alertHistory: {
      create: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
      count: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    prisma = {
      alertRule: {
        create: vi.fn().mockResolvedValue(baseRule),
        findMany: vi.fn().mockResolvedValue([baseRule]),
        findFirst: vi.fn().mockResolvedValue(baseRule),
        update: vi.fn().mockResolvedValue(baseRule),
        delete: vi.fn().mockResolvedValue(baseRule),
      },
      alertHistory: {
        create: vi.fn().mockResolvedValue({ id: 'hist-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    service = new AlertRulesService(prisma as unknown as PrismaService)
  })

  describe('create', () => {
    it('creates a rule with provided fields', async () => {
      const result = await service.create(
        {
          name: 'Payment Failures',
          conditionType: ConditionType.ANY_EVENT,
          eventName: 'payment.failed',
          channel: AlertChannel.SLACK,
          slackWebhookUrl: 'https://hooks.slack.com/test',
        },
        WORKSPACE_ID,
      )
      expect(result).toEqual(baseRule)
      expect(prisma.alertRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: WORKSPACE_ID, name: 'Payment Failures' }),
        }),
      )
    })

    it('defaults enabled to true', async () => {
      await service.create(
        { name: 'Test', conditionType: ConditionType.ANY_EVENT, channel: AlertChannel.WEBHOOK, webhookUrl: 'https://x.com/hook' },
        WORKSPACE_ID,
      )
      expect(prisma.alertRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ enabled: true }) }),
      )
    })
  })

  describe('findAll', () => {
    it('returns rules ordered by createdAt desc', async () => {
      const result = await service.findAll(WORKSPACE_ID)
      expect(result).toEqual([baseRule])
      expect(prisma.alertRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: WORKSPACE_ID }, orderBy: { createdAt: 'desc' } }),
      )
    })
  })

  describe('findOne', () => {
    it('returns rule when found', async () => {
      const result = await service.findOne(RULE_ID, WORKSPACE_ID)
      expect(result).toEqual(baseRule)
    })

    it('throws NotFoundException when rule not found', async () => {
      prisma.alertRule.findFirst.mockResolvedValue(null)
      await expect(service.findOne('missing', WORKSPACE_ID)).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('updates only provided fields', async () => {
      await service.update(RULE_ID, { name: 'New Name' }, WORKSPACE_ID)
      expect(prisma.alertRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'New Name' } }),
      )
    })
  })

  describe('remove', () => {
    it('deletes the rule', async () => {
      await service.remove(RULE_ID, WORKSPACE_ID)
      expect(prisma.alertRule.delete).toHaveBeenCalledWith({ where: { id: RULE_ID } })
    })

    it('throws NotFoundException when rule not found', async () => {
      prisma.alertRule.findFirst.mockResolvedValue(null)
      await expect(service.remove('missing', WORKSPACE_ID)).rejects.toThrow(NotFoundException)
    })
  })

  describe('toggle', () => {
    it('flips enabled from true to false', async () => {
      await service.toggle(RULE_ID, WORKSPACE_ID)
      expect(prisma.alertRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { enabled: false } }),
      )
    })

    it('flips enabled from false to true', async () => {
      prisma.alertRule.findFirst.mockResolvedValue({ ...baseRule, enabled: false })
      await service.toggle(RULE_ID, WORKSPACE_ID)
      expect(prisma.alertRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { enabled: true } }),
      )
    })
  })

  describe('findHistory', () => {
    it('queries history for workspace with defaults', async () => {
      prisma.alertHistory.findMany.mockResolvedValue([])
      prisma.alertHistory.count.mockResolvedValue(0)
      const result = await service.findHistory(WORKSPACE_ID, { limit: 50, offset: 0 })
      expect(result).toEqual({ items: [], total: 0 })
      expect(prisma.alertHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: WORKSPACE_ID } }),
      )
    })

    it('filters by ruleId when provided', async () => {
      await service.findHistory(WORKSPACE_ID, { ruleId: RULE_ID, limit: 50, offset: 0 })
      expect(prisma.alertHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: WORKSPACE_ID, ruleId: RULE_ID } }),
      )
    })
  })

  describe('recordHistory', () => {
    it('persists a history entry', async () => {
      await service.recordHistory({
        workspaceId: WORKSPACE_ID,
        ruleId: RULE_ID,
        eventId: 'evt-1',
        eventName: 'payment.failed',
        eventPayload: { amount: 99 },
        notificationStatus: 'sent',
      })
      expect(prisma.alertHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notificationStatus: 'sent' }),
        }),
      )
    })
  })

  describe('findEnabledRulesForWorkspace', () => {
    it('fetches only enabled rules for workspace', async () => {
      await service.findEnabledRulesForWorkspace(WORKSPACE_ID)
      expect(prisma.alertRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: WORKSPACE_ID, enabled: true } }),
      )
    })
  })
})

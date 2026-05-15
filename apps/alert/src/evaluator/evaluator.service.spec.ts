import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EvaluatorService, IngestedEvent } from './evaluator.service'
import { AlertRulesService } from '../alert-rules/alert-rules.service'
import { SlackNotifier } from '../notifiers/slack.notifier'
import { WebhookNotifier } from '../notifiers/webhook.notifier'
import { EmailNotifier } from '../notifiers/email.notifier'
import { AlertRedisService } from '../redis/redis.service'

const makeEvent = (overrides: Partial<IngestedEvent> = {}): IngestedEvent => ({
  eventId: 'evt-123',
  eventName: 'order.placed',
  workspaceId: 'ws-1',
  properties: { plan: 'pro', amount: 99 },
  ...overrides,
})

const makeRule = (overrides: Record<string, unknown> = {}) => ({
  id: 'rule-1',
  name: 'Test Rule',
  workspaceId: 'ws-1',
  conditionType: 'any_event',
  eventName: null,
  propertyPath: null,
  propertyValue: null,
  thresholdCount: null,
  windowSeconds: null,
  channel: 'slack',
  slackWebhookUrl: 'https://hooks.slack.com/test',
  webhookUrl: null,
  recipientEmail: null,
  enabled: true,
  ...overrides,
})

describe('EvaluatorService', () => {
  let service: EvaluatorService
  let rulesService: { findEnabledRulesForWorkspace: ReturnType<typeof vi.fn>; recordHistory: ReturnType<typeof vi.fn> }
  let slack: { send: ReturnType<typeof vi.fn> }
  let webhook: { send: ReturnType<typeof vi.fn> }
  let email: { send: ReturnType<typeof vi.fn> }
  let redis: { incr: ReturnType<typeof vi.fn>; expire: ReturnType<typeof vi.fn>; setNx: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    rulesService = {
      findEnabledRulesForWorkspace: vi.fn().mockResolvedValue([]),
      recordHistory: vi.fn().mockResolvedValue(undefined),
    }
    slack = { send: vi.fn().mockResolvedValue(undefined) }
    webhook = { send: vi.fn().mockResolvedValue(undefined) }
    email = { send: vi.fn().mockResolvedValue(undefined) }
    redis = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(undefined),
      setNx: vi.fn().mockResolvedValue('OK'),
    }

    service = new EvaluatorService(
      rulesService as unknown as AlertRulesService,
      slack as unknown as SlackNotifier,
      webhook as unknown as WebhookNotifier,
      email as unknown as EmailNotifier,
      redis as unknown as AlertRedisService,
    )
  })

  describe('evaluate — no rules', () => {
    it('does nothing when no rules exist for workspace', async () => {
      await service.evaluate(makeEvent())
      expect(slack.send).not.toHaveBeenCalled()
      expect(webhook.send).not.toHaveBeenCalled()
      expect(rulesService.recordHistory).not.toHaveBeenCalled()
    })
  })

  describe('any_event condition', () => {
    it('fires for every event when no eventName filter set', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([makeRule()])
      await service.evaluate(makeEvent({ eventName: 'user.signedUp' }))
      expect(slack.send).toHaveBeenCalledOnce()
      expect(rulesService.recordHistory).toHaveBeenCalledWith(
        expect.objectContaining({ notificationStatus: 'sent' }),
      )
    })

    it('fires only for matching eventName when filter is set', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ eventName: 'payment.failed' }),
      ])

      await service.evaluate(makeEvent({ eventName: 'order.placed' }))
      expect(slack.send).not.toHaveBeenCalled()
      expect(rulesService.recordHistory).not.toHaveBeenCalled()

      await service.evaluate(makeEvent({ eventName: 'payment.failed' }))
      expect(slack.send).toHaveBeenCalledOnce()
    })

    it('evaluates multiple rules independently', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ id: 'rule-1', eventName: 'payment.failed' }),
        makeRule({ id: 'rule-2', eventName: null }),
      ])
      await service.evaluate(makeEvent({ eventName: 'payment.failed' }))
      expect(slack.send).toHaveBeenCalledTimes(2)
      expect(rulesService.recordHistory).toHaveBeenCalledTimes(2)
    })
  })

  describe('property_equals condition', () => {
    it('fires when property matches', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ conditionType: 'property_equals', propertyPath: 'plan', propertyValue: 'pro' }),
      ])
      await service.evaluate(makeEvent({ properties: { plan: 'pro' } }))
      expect(slack.send).toHaveBeenCalledOnce()
    })

    it('does not fire when property does not match', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ conditionType: 'property_equals', propertyPath: 'plan', propertyValue: 'pro' }),
      ])
      await service.evaluate(makeEvent({ properties: { plan: 'free' } }))
      expect(slack.send).not.toHaveBeenCalled()
    })

    it('resolves nested property via dot notation', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ conditionType: 'property_equals', propertyPath: 'billing.status', propertyValue: 'past_due' }),
      ])
      await service.evaluate(makeEvent({ properties: { billing: { status: 'past_due' } } }))
      expect(slack.send).toHaveBeenCalledOnce()
    })

    it('returns false for missing propertyPath', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ conditionType: 'property_equals', propertyPath: null, propertyValue: 'pro' }),
      ])
      await service.evaluate(makeEvent())
      expect(slack.send).not.toHaveBeenCalled()
    })
  })

  describe('count_threshold condition', () => {
    it('fires when count reaches threshold', async () => {
      redis.incr.mockResolvedValue(10)
      redis.setNx.mockResolvedValue('OK')
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ conditionType: 'count_threshold', thresholdCount: 10, windowSeconds: 60 }),
      ])
      await service.evaluate(makeEvent())
      expect(slack.send).toHaveBeenCalledOnce()
    })

    it('does not fire when count is below threshold', async () => {
      redis.incr.mockResolvedValue(5)
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ conditionType: 'count_threshold', thresholdCount: 10, windowSeconds: 60 }),
      ])
      await service.evaluate(makeEvent())
      expect(slack.send).not.toHaveBeenCalled()
    })

    it('fires only once per window when threshold is reached multiple times', async () => {
      redis.incr.mockResolvedValue(15)
      redis.setNx.mockResolvedValue(null) // already fired this window
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ conditionType: 'count_threshold', thresholdCount: 10, windowSeconds: 60 }),
      ])
      await service.evaluate(makeEvent())
      expect(slack.send).not.toHaveBeenCalled()
    })

    it('returns false when thresholdCount or windowSeconds is null', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ conditionType: 'count_threshold', thresholdCount: null, windowSeconds: null }),
      ])
      await service.evaluate(makeEvent())
      expect(slack.send).not.toHaveBeenCalled()
    })
  })

  describe('webhook channel', () => {
    it('sends webhook notification for webhook channel', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ channel: 'webhook', webhookUrl: 'https://example.com/hook', slackWebhookUrl: null }),
      ])
      await service.evaluate(makeEvent())
      expect(webhook.send).toHaveBeenCalledOnce()
      expect(slack.send).not.toHaveBeenCalled()
    })
  })

  describe('email channel', () => {
    it('sends email notification for email channel', async () => {
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ channel: 'email', slackWebhookUrl: null, recipientEmail: 'test@example.com' }),
      ])
      await service.evaluate(makeEvent())
      expect(email.send).toHaveBeenCalledOnce()
      expect(slack.send).not.toHaveBeenCalled()
    })
  })

  describe('notification failure handling', () => {
    it('records failed status when slack throws', async () => {
      slack.send.mockRejectedValue(new Error('Slack timeout'))
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([makeRule()])
      await service.evaluate(makeEvent())
      expect(rulesService.recordHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationStatus: 'failed',
          notificationError: 'Slack timeout',
        }),
      )
    })

    it('continues evaluating other rules after one fails', async () => {
      slack.send
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(undefined)
      rulesService.findEnabledRulesForWorkspace.mockResolvedValue([
        makeRule({ id: 'rule-1' }),
        makeRule({ id: 'rule-2' }),
      ])
      await service.evaluate(makeEvent())
      expect(rulesService.recordHistory).toHaveBeenCalledTimes(2)
      expect(rulesService.recordHistory).toHaveBeenNthCalledWith(1, expect.objectContaining({ notificationStatus: 'failed' }))
      expect(rulesService.recordHistory).toHaveBeenNthCalledWith(2, expect.objectContaining({ notificationStatus: 'sent' }))
    })
  })

  describe('workspace isolation', () => {
    it('fetches rules for the event workspace only', async () => {
      await service.evaluate(makeEvent({ workspaceId: 'ws-abc' }))
      expect(rulesService.findEnabledRulesForWorkspace).toHaveBeenCalledWith('ws-abc')
    })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { FilterStepExecutor } from './filter-step.executor'
import { FlowMeshEvent } from '@flowmesh/shared-types'

const makeEvent = (overrides: Partial<FlowMeshEvent> = {}): FlowMeshEvent => ({
  event: 'order.created',
  correlationId: 'corr-123',
  eventId: 'evt-123',
  timestamp: '2024-01-01T00:00:00Z',
  source: 'api',
  version: '1.0',
  userId: 'user-abc',
  properties: { plan: 'pro', amount: 100, tag: 'vip' },
  ...overrides,
})

describe('FilterStepExecutor', () => {
  let executor: FilterStepExecutor

  beforeEach(() => {
    executor = new FilterStepExecutor()
  })

  it('returns true when conditions list is empty', () => {
    expect(executor.execute(makeEvent(), { conditions: [], logic: 'AND' })).toBe(true)
  })

  it('returns true when no conditions key provided', () => {
    expect(executor.execute(makeEvent(), {})).toBe(true)
  })

  describe('equals operator', () => {
    it('passes when top-level field matches', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'event', operator: 'equals', value: 'order.created' }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })

    it('drops when top-level field does not match', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'event', operator: 'equals', value: 'order.updated' }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })

    it('passes when nested properties field matches', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.plan', operator: 'equals', value: 'pro' }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })
  })

  describe('not_equals operator', () => {
    it('passes when value differs', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.plan', operator: 'not_equals', value: 'free' }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })

    it('drops when value matches', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.plan', operator: 'not_equals', value: 'pro' }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })
  })

  describe('contains operator', () => {
    it('passes when string contains substring', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.tag', operator: 'contains', value: 'vi' }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })

    it('drops when string does not contain substring', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.tag', operator: 'contains', value: 'free' }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })
  })

  describe('starts_with / ends_with operators', () => {
    it('passes starts_with', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'event', operator: 'starts_with', value: 'order' }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })

    it('passes ends_with', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'event', operator: 'ends_with', value: 'created' }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })

    it('drops starts_with when prefix does not match', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'event', operator: 'starts_with', value: 'user' }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })
  })

  describe('greater_than / less_than operators', () => {
    it('passes greater_than when field value is larger', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.amount', operator: 'greater_than', value: 50 }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })

    it('drops greater_than when field value is smaller', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.amount', operator: 'greater_than', value: 200 }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })

    it('passes less_than when field value is smaller', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.amount', operator: 'less_than', value: 200 }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })
  })

  describe('in / not_in operators', () => {
    it('passes in when value is in the array', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.plan', operator: 'in', value: ['free', 'pro', 'enterprise'] }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })

    it('drops in when value is not in the array', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.plan', operator: 'in', value: ['free', 'enterprise'] }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })

    it('passes not_in when value is absent from array', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.plan', operator: 'not_in', value: ['free'] }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })
  })

  describe('exists operator', () => {
    it('passes exists:true when field is present', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'userId', operator: 'exists', value: true }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })

    it('drops exists:true when field is absent', () => {
      const result = executor.execute(makeEvent({ userId: undefined }), {
        conditions: [{ field: 'userId', operator: 'exists', value: true }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })

    it('passes exists:false when field is absent', () => {
      const result = executor.execute(makeEvent({ userId: undefined }), {
        conditions: [{ field: 'userId', operator: 'exists', value: false }],
        logic: 'AND',
      })
      expect(result).toBe(true)
    })
  })

  describe('AND / OR logic', () => {
    const conditions = [
      { field: 'event', operator: 'equals', value: 'order.created' },
      { field: 'properties.plan', operator: 'equals', value: 'enterprise' }, // false — plan is 'pro'
    ]

    it('AND drops when any condition fails', () => {
      const result = executor.execute(makeEvent(), { conditions, logic: 'AND' })
      expect(result).toBe(false)
    })

    it('OR passes when at least one condition passes', () => {
      const result = executor.execute(makeEvent(), { conditions, logic: 'OR' })
      expect(result).toBe(true)
    })
  })

  describe('field path resolution', () => {
    it('returns undefined for missing nested path without throwing', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'properties.nonexistent.deep', operator: 'equals', value: 'x' }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })

    it('returns undefined for missing top-level field', () => {
      const result = executor.execute(makeEvent(), {
        conditions: [{ field: 'anonymousId', operator: 'equals', value: 'anon-1' }],
        logic: 'AND',
      })
      expect(result).toBe(false)
    })
  })
})

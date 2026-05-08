import { describe, it, expect, beforeEach } from 'vitest'
import { TransformStepExecutor } from './transform-step.executor'
import { FlowMeshEvent } from '@flowmesh/shared-types'

const makeEvent = (overrides: Partial<FlowMeshEvent> = {}): FlowMeshEvent => ({
  event: 'order.created',
  correlationId: 'corr-123',
  eventId: 'evt-123',
  timestamp: '2024-01-01T00:00:00Z',
  source: 'api',
  version: '1.0',
  userId: 'user-abc',
  properties: { plan: 'pro', amount: 100, internal: 'secret' },
  ...overrides,
})

describe('TransformStepExecutor', () => {
  let executor: TransformStepExecutor

  beforeEach(() => {
    executor = new TransformStepExecutor()
  })

  it('returns event unchanged when operations list is empty', () => {
    const event = makeEvent()
    const result = executor.execute(event, { operations: [] })
    expect(result).toEqual(event)
  })

  it('returns event unchanged when no operations key provided', () => {
    const event = makeEvent()
    const result = executor.execute(event, {})
    expect(result).toEqual(event)
  })

  it('does not mutate the original event', () => {
    const event = makeEvent()
    const original = JSON.parse(JSON.stringify(event)) as FlowMeshEvent
    executor.execute(event, {
      operations: [{ op: 'set', field: 'properties.plan', value: 'enterprise' }],
    })
    expect(event).toEqual(original)
  })

  describe('set operation', () => {
    it('sets a top-level field', () => {
      const result = executor.execute(makeEvent(), {
        operations: [{ op: 'set', field: 'userId', value: 'new-user' }],
      })
      expect(result.userId).toBe('new-user')
    })

    it('sets a nested properties field', () => {
      const result = executor.execute(makeEvent(), {
        operations: [{ op: 'set', field: 'properties.plan', value: 'enterprise' }],
      })
      expect((result.properties as Record<string, unknown>)['plan']).toBe('enterprise')
    })

    it('creates intermediate objects for deep paths', () => {
      const result = executor.execute(makeEvent(), {
        operations: [{ op: 'set', field: 'properties.meta.source', value: 'web' }],
      })
      expect(((result.properties as Record<string, unknown>)['meta'] as Record<string, unknown>)['source']).toBe('web')
    })

    it('sets a boolean value', () => {
      const result = executor.execute(makeEvent(), {
        operations: [{ op: 'set', field: 'properties.verified', value: true }],
      })
      expect((result.properties as Record<string, unknown>)['verified']).toBe(true)
    })
  })

  describe('rename operation', () => {
    it('moves a properties field to a new name', () => {
      const result = executor.execute(makeEvent(), {
        operations: [{ op: 'rename', from: 'properties.plan', to: 'properties.tier' }],
      })
      const props = result.properties as Record<string, unknown>
      expect(props['tier']).toBe('pro')
      expect(props['plan']).toBeUndefined()
    })

    it('moves a top-level field to properties', () => {
      const result = executor.execute(makeEvent(), {
        operations: [{ op: 'rename', from: 'userId', to: 'properties.user_id' }],
      })
      const props = result.properties as Record<string, unknown>
      expect(props['user_id']).toBe('user-abc')
      expect((result as unknown as Record<string, unknown>)['userId']).toBeUndefined()
    })
  })

  describe('delete operation', () => {
    it('removes a properties field', () => {
      const result = executor.execute(makeEvent(), {
        operations: [{ op: 'delete', field: 'properties.internal' }],
      })
      const props = result.properties as Record<string, unknown>
      expect(props['internal']).toBeUndefined()
      expect(props['plan']).toBe('pro') // other fields preserved
    })

    it('removes a top-level field', () => {
      const result = executor.execute(makeEvent(), {
        operations: [{ op: 'delete', field: 'userId' }],
      })
      expect((result as unknown as Record<string, unknown>)['userId']).toBeUndefined()
    })

    it('does not throw when deleting a missing field', () => {
      expect(() =>
        executor.execute(makeEvent(), {
          operations: [{ op: 'delete', field: 'properties.nonexistent' }],
        }),
      ).not.toThrow()
    })
  })

  describe('multiple operations', () => {
    it('applies operations in sequence', () => {
      const result = executor.execute(makeEvent(), {
        operations: [
          { op: 'set', field: 'properties.processed', value: true },
          { op: 'delete', field: 'properties.internal' },
          { op: 'rename', from: 'properties.plan', to: 'properties.tier' },
        ],
      })
      const props = result.properties as Record<string, unknown>
      expect(props['processed']).toBe(true)
      expect(props['internal']).toBeUndefined()
      expect(props['tier']).toBe('pro')
      expect(props['plan']).toBeUndefined()
    })
  })
})

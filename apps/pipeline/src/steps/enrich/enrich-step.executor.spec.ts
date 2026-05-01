import { describe, it, expect, beforeEach } from 'vitest'
import { EnrichStepExecutor } from './enrich-step.executor'
import { FlowMeshEvent } from '@flowmesh/shared-types'

const makeEvent = (overrides: Partial<FlowMeshEvent> = {}): FlowMeshEvent => ({
  event: 'order.created',
  correlationId: 'corr-123',
  eventId: 'evt-123',
  timestamp: '2024-01-01T00:00:00Z',
  source: 'api',
  version: '1.0',
  properties: { plan: 'pro' },
  ...overrides,
})

describe('EnrichStepExecutor', () => {
  let executor: EnrichStepExecutor

  beforeEach(() => {
    executor = new EnrichStepExecutor()
  })

  it('returns event unchanged when fields is empty', () => {
    const event = makeEvent()
    const result = executor.execute(event, { fields: {} })
    expect(result).toEqual(event)
  })

  it('returns event unchanged when no fields key provided', () => {
    const event = makeEvent()
    const result = executor.execute(event, {})
    expect(result).toEqual(event)
  })

  it('does not mutate the original event', () => {
    const event = makeEvent()
    const original = JSON.parse(JSON.stringify(event)) as FlowMeshEvent
    executor.execute(event, { fields: { 'properties.environment': 'production' } })
    expect(event).toEqual(original)
  })

  it('adds a static nested field', () => {
    const result = executor.execute(makeEvent(), {
      fields: { 'properties.environment': 'production' },
    })
    expect((result.properties as Record<string, unknown>)['environment']).toBe('production')
  })

  it('adds multiple static fields', () => {
    const result = executor.execute(makeEvent(), {
      fields: {
        'properties.environment': 'production',
        'properties.pipeline': 'order-tracking',
        'properties.version': 2,
      },
    })
    const props = result.properties as Record<string, unknown>
    expect(props['environment']).toBe('production')
    expect(props['pipeline']).toBe('order-tracking')
    expect(props['version']).toBe(2)
  })

  it('overwrites an existing field', () => {
    const result = executor.execute(makeEvent(), {
      fields: { 'properties.plan': 'enterprise' },
    })
    expect((result.properties as Record<string, unknown>)['plan']).toBe('enterprise')
  })

  it('creates intermediate objects for deep paths', () => {
    const result = executor.execute(makeEvent(), {
      fields: { 'properties.meta.source': 'enriched' },
    })
    const props = result.properties as Record<string, unknown>
    expect((props['meta'] as Record<string, unknown>)['source']).toBe('enriched')
  })

  it('adds a boolean static value', () => {
    const result = executor.execute(makeEvent(), {
      fields: { 'properties.enriched': true },
    })
    expect((result.properties as Record<string, unknown>)['enriched']).toBe(true)
  })

  it('preserves existing properties not in the fields map', () => {
    const result = executor.execute(makeEvent(), {
      fields: { 'properties.environment': 'staging' },
    })
    expect((result.properties as Record<string, unknown>)['plan']).toBe('pro')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { CacheKeyFactory } from './cache-key.factory'

describe('CacheKeyFactory', () => {
  let factory: CacheKeyFactory

  beforeEach(() => {
    factory = new CacheKeyFactory('config', 'pipeline')
  })

  describe('one', () => {
    it('returns service:domain:id when no workspaceId', () => {
      expect(factory.one('abc-123')).toBe('config:pipeline:abc-123')
    })

    it('returns service:domain:workspaceId:id when workspaceId provided', () => {
      expect(factory.one('abc-123', 'ws-456')).toBe('config:pipeline:ws-456:abc-123')
    })
  })

  describe('list', () => {
    it('returns service:domain:list when no workspaceId', () => {
      expect(factory.list()).toBe('config:pipeline:list')
    })

    it('returns service:domain:workspaceId:list when workspaceId provided', () => {
      expect(factory.list('ws-456')).toBe('config:pipeline:ws-456:list')
    })
  })

  describe('pattern', () => {
    it('returns service:domain:* when no workspaceId', () => {
      expect(factory.pattern()).toBe('config:pipeline:*')
    })

    it('returns service:domain:workspaceId:* when workspaceId provided', () => {
      expect(factory.pattern('ws-456')).toBe('config:pipeline:ws-456:*')
    })
  })

  it('different domain produces different keys for the same id', () => {
    const dest = new CacheKeyFactory('config', 'destination')
    expect(factory.one('abc')).not.toBe(dest.one('abc'))
    expect(factory.one('abc')).toBe('config:pipeline:abc')
    expect(dest.one('abc')).toBe('config:destination:abc')
  })

  it('different service produces different keys for the same domain and id', () => {
    const gateway = new CacheKeyFactory('gateway', 'pipeline')
    expect(factory.one('abc')).not.toBe(gateway.one('abc'))
  })
})

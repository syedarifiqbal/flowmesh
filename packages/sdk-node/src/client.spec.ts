import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FlowMesh } from './client.js'

const VALID_EVENT = {
  event: 'user.signed_up',
  source: 'server',
  version: '1.0',
  userId: 'user_123',
}

function makeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    json: () => Promise.resolve(body),
  })
}

describe('FlowMesh', () => {
  describe('constructor', () => {
    it('throws when apiKey is missing', () => {
      expect(() => new FlowMesh({ apiKey: '' })).toThrow('apiKey is required')
    })

    it('strips trailing slash from host', () => {
      const client = new FlowMesh({ apiKey: 'fm_test', host: 'http://localhost:3000/' })
      expect(client).toBeDefined()
    })
  })

  describe('track', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', makeFetch(202, { status: 'accepted', eventId: 'evt-1' }))
    })

    it('posts to /ingest/events with api key header', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test', host: 'http://localhost:3000' })
      const result = await client.track(VALID_EVENT)

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/ingest/events',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-api-key': 'fm_test' }),
        }),
      )
      expect(result).toEqual({ status: 'accepted', eventId: 'evt-1' })
    })

    it('throws when event is missing', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test' })
      await expect(client.track({ ...VALID_EVENT, event: '' })).rejects.toThrow('event is required')
    })

    it('throws when source is missing', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test' })
      await expect(client.track({ ...VALID_EVENT, source: '' })).rejects.toThrow('source is required')
    })

    it('throws when version is missing', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test' })
      await expect(client.track({ ...VALID_EVENT, version: '' })).rejects.toThrow('version is required')
    })

    it('throws when neither userId nor anonymousId is provided', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test' })
      const { userId: _, ...noUser } = VALID_EVENT
      await expect(client.track(noUser)).rejects.toThrow('userId or anonymousId is required')
    })

    it('accepts anonymousId in place of userId', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test' })
      const { userId: _, ...noUser } = VALID_EVENT
      const result = await client.track({ ...noUser, anonymousId: 'anon_123' })
      expect(result.status).toBe('accepted')
    })

    it('retries on 500 and succeeds', async () => {
      let calls = 0
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        calls++
        if (calls < 2) return Promise.resolve({ status: 500, json: () => Promise.resolve({}) })
        return Promise.resolve({ status: 202, json: () => Promise.resolve({ status: 'accepted', eventId: 'evt-1' }) })
      }))

      const client = new FlowMesh({ apiKey: 'fm_test', maxRetries: 3 })
      const result = await client.track(VALID_EVENT)
      expect(calls).toBe(2)
      expect(result.eventId).toBe('evt-1')
    })

    it('throws after exhausting retries on persistent 500', async () => {
      vi.stubGlobal('fetch', makeFetch(500, {}))
      const client = new FlowMesh({ apiKey: 'fm_test', maxRetries: 2 })
      await expect(client.track(VALID_EVENT)).rejects.toThrow('status 500')
    })

    it('throws immediately on 400 without retrying', async () => {
      vi.stubGlobal('fetch', makeFetch(400, { message: 'bad request' }))
      const client = new FlowMesh({ apiKey: 'fm_test', maxRetries: 3 })
      await expect(client.track(VALID_EVENT)).rejects.toThrow('status 400')
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('throws immediately on 401 without retrying', async () => {
      vi.stubGlobal('fetch', makeFetch(401, {}))
      const client = new FlowMesh({ apiKey: 'fm_test', maxRetries: 3 })
      await expect(client.track(VALID_EVENT)).rejects.toThrow('status 401')
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('batch', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', makeFetch(202, { accepted: 2, duplicates: 0, results: [] }))
    })

    it('throws when batch is empty', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test' })
      await expect(client.batch([])).rejects.toThrow('at least one event')
    })

    it('posts to /ingest/events/batch', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test' })
      await client.batch([VALID_EVENT, VALID_EVENT])
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/ingest/events/batch'),
        expect.anything(),
      )
    })

    it('validates each event in the batch', async () => {
      const client = new FlowMesh({ apiKey: 'fm_test' })
      await expect(
        client.batch([VALID_EVENT, { ...VALID_EVENT, event: '' }]),
      ).rejects.toThrow('batch[1]: event is required')
    })
  })
})

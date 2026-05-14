import { withRetry } from './retry.js'
import type { FlowMeshOptions, TrackInput, TrackResult, BatchResult, IdentifyInput, IdentifyResult, AliasInput, AliasResult } from './types.js'

const DEFAULT_HOST = 'http://localhost:3000'
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_TIMEOUT_MS = 10_000

export class FlowMesh {
  private readonly apiKey: string
  private readonly host: string
  private readonly maxRetries: number
  private readonly timeoutMs: number

  constructor(options: FlowMeshOptions) {
    if (!options.apiKey) throw new Error('FlowMesh: apiKey is required')
    this.apiKey = options.apiKey
    this.host = (options.host ?? DEFAULT_HOST).replace(/\/$/, '')
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async track(input: TrackInput): Promise<TrackResult> {
    this.validateInput(input)

    return withRetry(async () => {
      const res = await this.post('/ingest/events', input)
      const body = await res.json() as TrackResult
      return { status: res.status, body }
    }, this.maxRetries)
  }

  async identify(input: IdentifyInput): Promise<IdentifyResult> {
    if (!input.userId) throw new Error('FlowMesh: userId is required for identify')
    if (!input.source) throw new Error('FlowMesh: source is required')
    if (!input.version) throw new Error('FlowMesh: version is required')

    return withRetry(async () => {
      const res = await this.post('/ingest/events/identify', input)
      const body = await res.json() as IdentifyResult
      return { status: res.status, body }
    }, this.maxRetries)
  }

  async alias(input: AliasInput): Promise<AliasResult> {
    if (!input.userId) throw new Error('FlowMesh: userId is required for alias')
    if (!input.anonymousId) throw new Error('FlowMesh: anonymousId is required for alias')
    if (!input.source) throw new Error('FlowMesh: source is required')
    if (!input.version) throw new Error('FlowMesh: version is required')

    return withRetry(async () => {
      const res = await this.post('/ingest/events/alias', input)
      const body = await res.json() as AliasResult
      return { status: res.status, body }
    }, this.maxRetries)
  }

  async batch(inputs: TrackInput[]): Promise<BatchResult> {
    if (!inputs.length) throw new Error('FlowMesh: batch requires at least one event')
    inputs.forEach((e, i) => this.validateInput(e, i))

    return withRetry(async () => {
      const res = await this.post('/ingest/events/batch', { events: inputs })
      const body = await res.json() as BatchResult
      return { status: res.status, body }
    }, this.maxRetries)
  }

  private validateInput(input: TrackInput, index?: number): void {
    const prefix = index !== undefined ? `FlowMesh: batch[${index}]` : 'FlowMesh'
    if (!input.event) throw new Error(`${prefix}: event is required`)
    if (!input.source) throw new Error(`${prefix}: source is required`)
    if (!input.version) throw new Error(`${prefix}: version is required`)
    if (!input.userId && !input.anonymousId) {
      throw new Error(`${prefix}: userId or anonymousId is required`)
    }
  }

  private post(path: string, body: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    return fetch(`${this.host}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))
  }
}

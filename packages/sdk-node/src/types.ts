export interface FlowMeshOptions {
  apiKey: string
  /** Base URL of your FlowMesh instance. Defaults to http://localhost:3000. */
  host?: string
  /** Max delivery attempts per request. Defaults to 3. */
  maxRetries?: number
  /** Request timeout in milliseconds. Defaults to 10000. */
  timeoutMs?: number
}

export interface TrackInput {
  event: string
  source: string
  version: string
  userId?: string
  anonymousId?: string
  sessionId?: string
  eventId?: string
  timestamp?: string
  properties?: Record<string, unknown>
  context?: Record<string, unknown>
}

export interface TrackResult {
  status: 'accepted' | 'duplicate'
  eventId: string
}

export interface BatchResult {
  accepted: number
  duplicates: number
  results: TrackResult[]
}

export interface FlowMeshError extends Error {
  status?: number
}

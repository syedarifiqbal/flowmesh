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

export interface IdentifyInput {
  userId: string
  anonymousId?: string
  source: string
  version: string
  traits?: Record<string, unknown>
  eventId?: string
  timestamp?: string
  context?: Record<string, unknown>
}

export interface IdentifyResult {
  userId: string
  status: 'created' | 'updated'
}

export interface AliasInput {
  userId: string
  anonymousId: string
  source: string
  version: string
  eventId?: string
  timestamp?: string
}

export interface AliasResult {
  userId: string
  anonymousId: string
  status: 'created' | 'exists'
}

export interface PageInput {
  name: string
  url?: string
  source: string
  version: string
  userId?: string
  anonymousId?: string
  sessionId?: string
  eventId?: string
  timestamp?: string
  context?: Record<string, unknown>
}

export interface GroupInput {
  groupId: string
  userId: string
  source: string
  version: string
  traits?: Record<string, unknown>
  eventId?: string
  timestamp?: string
  context?: Record<string, unknown>
}

export interface GroupResult {
  groupId: string
  userId: string
  status: 'created' | 'updated'
}

export interface FlowMeshError extends Error {
  status?: number
}

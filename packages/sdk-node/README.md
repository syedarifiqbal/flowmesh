# flowmesh-node

Official Node.js SDK for [FlowMesh](https://github.com/syedarifiqbal/flowmesh) — the self-hostable, open-source event pipeline platform.

Send events from your Node.js or TypeScript server to a FlowMesh instance. Events are routed through your pipelines, delivered to destinations (PostgreSQL, Slack, S3, webhooks, Discord), and appear in the real-time dashboard.

---

## Install

```bash
npm install flowmesh-node
# or
pnpm add flowmesh-node
```

Requires Node.js 20+.

---

## Quick start

```typescript
import { FlowMesh } from 'flowmesh-node'

const client = new FlowMesh({
  apiKey: 'fm_your_api_key_here',
  host: 'http://your-flowmesh-instance:3000', // defaults to http://localhost:3000
})

await client.track({
  event: 'order.placed',
  source: 'server',
  version: '1.0',
  userId: 'user_123',
  properties: {
    orderId: 'ord_abc',
    total: 49.99,
    currency: 'USD',
  },
})
```

---

## Initialisation

```typescript
const client = new FlowMesh({
  apiKey: string      // Required. API key from your FlowMesh dashboard.
  host?: string       // Base URL of your FlowMesh instance. Default: http://localhost:3000
  maxRetries?: number // Delivery attempts per call before throwing. Default: 3
  timeoutMs?: number  // Per-request timeout in milliseconds. Default: 10000
})
```

Throws immediately if `apiKey` is empty.

---

## Methods

### `track(input)`

Send a named event.

```typescript
await client.track({
  event: 'product.viewed',   // required — dot-notation event name
  source: 'server',          // required — origin: 'server', 'web', 'mobile', etc.
  version: '1.0',            // required — schema version
  userId: 'user_123',        // required if anonymousId absent
  anonymousId: 'anon_xyz',   // required if userId absent
  sessionId: 'sess_abc',     // optional
  eventId: 'uuid-here',      // optional — provide for idempotency; auto-generated if omitted
  timestamp: '2026-01-01T00:00:00Z', // optional — server time used if omitted
  properties: {              // optional — arbitrary payload
    productId: 'prod_456',
    name: 'Wireless Headphones',
    price: 79.99,
  },
  context: {},               // optional
})
// → { eventId: 'uuid', status: 'accepted' | 'duplicate' }
```

### `identify(input)`

Store traits for a known user. Call this when a user signs up or logs in.

```typescript
await client.identify({
  userId: 'user_123',        // required
  source: 'server',          // required
  version: '1.0',            // required
  anonymousId: 'anon_xyz',   // optional — the anonymous ID being linked, if known
  traits: {                  // optional — user attributes
    name: 'Jane Smith',
    email: 'jane@example.com',
    plan: 'pro',
  },
  eventId: 'uuid-here',      // optional
  timestamp: '...',          // optional
})
// → { userId: 'user_123', status: 'created' | 'updated' }
```

### `alias(input)`

Link an anonymous visitor ID to a known user ID. Call this once at login, after `identify()`, to merge the pre-login anonymous history.

```typescript
await client.alias({
  userId: 'user_123',        // required — the known user to link to
  anonymousId: 'anon_xyz',   // required — the anonymous ID to merge
  source: 'server',          // required
  version: '1.0',            // required
  eventId: 'uuid-here',      // optional
})
// → { userId: 'user_123', anonymousId: 'anon_xyz', status: 'created' | 'exists' }
```

### `page(input)`

Record a page view. Stored as a `page.viewed` event.

```typescript
await client.page({
  name: 'Product Detail',    // required — human-readable page name
  source: 'server',          // required
  version: '1.0',            // required
  userId: 'user_123',        // required if anonymousId absent
  anonymousId: 'anon_xyz',   // required if userId absent
  url: 'https://example.com/products/123', // optional
  sessionId: 'sess_abc',     // optional
  eventId: 'uuid-here',      // optional
})
// → { eventId: 'uuid', status: 'accepted' | 'duplicate' }
```

### `group(input)`

Assign a user to a group (company, team, account, segment).

```typescript
await client.group({
  groupId: 'acme-corp',      // required
  userId: 'user_123',        // required
  source: 'server',          // required
  version: '1.0',            // required
  traits: {                  // optional — group attributes
    name: 'Acme Corp',
    plan: 'enterprise',
    employees: 250,
  },
  eventId: 'uuid-here',      // optional
})
// → { groupId: 'acme-corp', userId: 'user_123', status: 'created' | 'updated' }
```

### `batch(inputs[])`

Send multiple track events in a single HTTP request. More efficient than calling `track()` in a loop.

```typescript
await client.batch([
  {
    event: 'order.placed',
    source: 'server',
    version: '1.0',
    userId: 'user_123',
    properties: { orderId: 'ord_abc', total: 49.99 },
  },
  {
    event: 'checkout.completed',
    source: 'server',
    version: '1.0',
    userId: 'user_123',
    properties: { orderId: 'ord_abc' },
  },
])
// → { accepted: 2, duplicates: 0, results: [{ eventId, status }, ...] }
```

Array must have at least one element. Each element is validated as a `track()` input before any network call.

---

## Error handling

```typescript
try {
  await client.track({ ... })
} catch (err) {
  if (err instanceof Error) {
    console.error(err.message) // 'FlowMesh request failed with status 401'
    console.error((err as any).status) // 401
  }
}
```

| Response | Behaviour |
|---|---|
| `2xx` | Returns result. No retry. |
| `429` or `5xx` | Retries with exponential backoff up to `maxRetries`. |
| `4xx` (not 429) | Throws immediately. No retry — these are caller errors (bad input, wrong API key). |
| Timeout | Treated as transient. Retries up to `maxRetries`. |
| Network error | Retries up to `maxRetries`. |

After `maxRetries` attempts all fail, throws an `Error` with the HTTP status code attached as `err.status`.

**Validation errors** (missing required fields) throw before any network call is made.

---

## Idempotency

Pass `eventId` to guarantee exactly-once processing. If the same `eventId` is received twice, the second call returns `{ status: 'duplicate' }` and is not reprocessed.

```typescript
import { randomUUID } from 'crypto'

await client.track({
  event: 'payment.processed',
  source: 'server',
  version: '1.0',
  userId: 'user_123',
  eventId: randomUUID(), // generate once, store alongside your payment record
  properties: { paymentId: 'pay_xyz', amount: 99.00 },
})
```

---

## TypeScript

Full TypeScript support. All input and result types are exported:

```typescript
import type {
  FlowMeshOptions,
  TrackInput,
  TrackResult,
  BatchResult,
  IdentifyInput,
  IdentifyResult,
  AliasInput,
  AliasResult,
  PageInput,
  GroupInput,
  GroupResult,
} from 'flowmesh-node'
```

---

## Full API contract

See [`docs/sdk-contract.md`](https://github.com/syedarifiqbal/flowmesh/blob/main/docs/sdk-contract.md) in the FlowMesh repo for the complete specification that all SDKs implement.

---

## License

MIT — [FlowMesh](https://github.com/syedarifiqbal/flowmesh)

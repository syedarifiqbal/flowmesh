# FlowMesh SDK Contract

This document is the single source of truth for every FlowMesh client SDK. If you are building an SDK in a new language, implement everything here exactly. If you find a gap or an inconsistency, open an issue before changing anything — the contract must stay in sync across all SDKs.

**Reference implementation:** `packages/sdk-node/` (`flowmesh-node` on npm)

---

## Methods

Every SDK implements exactly these four methods. No SDK ships a subset. Future methods (`page`, `group`) are added to this document first and then implemented in all SDKs simultaneously.

| Method | Endpoint | Purpose |
|---|---|---|
| `track(input)` | `POST /ingest/events` | Send a named event |
| `identify(input)` | `POST /ingest/events/identify` | Store traits for a known user |
| `alias(input)` | `POST /ingest/events/alias` | Link an anonymous visitor to a known user |
| `batch(inputs[])` | `POST /ingest/events/batch` | Send multiple track events in one call |
| `page(input)` | `POST /ingest/events/page` | Record a page view (auto-sets event to `page.viewed`) |
| `group(input)` | `POST /ingest/events/group` | Associate a user with an organisation or account |

---

## Initialisation

```
new FlowMesh({
  apiKey:     string   required    Your FlowMesh API key
  host:       string   optional    Base URL of your FlowMesh instance. Default: http://localhost:3000
  maxRetries: integer  optional    Delivery attempts per call. Default: 3
  timeoutMs:  integer  optional    Per-request timeout in ms. Default: 10000
})
```

- Throw on construction if `apiKey` is empty or missing
- Strip trailing slash from `host`
- Language-idiomatic naming allowed (`api_key` in Python) — semantics must be identical

---

## track

Send a named event. Every meaningful user action or system event should be a `track` call.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `event` | string | ✅ | Dot-notation event name, e.g. `order.placed`, `page.viewed` |
| `source` | string | ✅ | Origin: `web`, `server`, `mobile`, `ios`, `android` |
| `version` | string | ✅ | Schema version, e.g. `1.0` |
| `userId` | string | one-of | Authenticated user ID. Required if `anonymousId` absent. |
| `anonymousId` | string | one-of | Anonymous visitor ID. Required if `userId` absent. |
| `sessionId` | string | optional | Session identifier |
| `eventId` | UUID | optional | Provide to guarantee idempotency. Auto-generated if omitted. |
| `timestamp` | ISO 8601 | optional | Event time. Server time used if omitted. |
| `properties` | object | optional | Arbitrary key-value payload |
| `context` | object | optional | Request context: IP, user agent, page URL |

**Response:**

```json
{ "eventId": "uuid", "status": "accepted" }
{ "eventId": "uuid", "status": "duplicate" }
```

`duplicate` means the `eventId` was already processed. The event was not re-inserted. Return this to the caller — do not raise an error.

---

## identify

Store traits for a known user. Call this immediately after a user registers or logs in. Subsequent calls for the same `userId` update the stored traits (upsert).

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | string | ✅ | The known user ID |
| `source` | string | ✅ | Origin of the identify call |
| `version` | string | ✅ | Schema version |
| `anonymousId` | string | optional | The anonymous ID the user had before logging in, if known |
| `traits` | object | optional | User attributes: `name`, `email`, `plan`, `company`, etc. |
| `eventId` | UUID | optional | Idempotency key |
| `timestamp` | ISO 8601 | optional | |
| `context` | object | optional | |

**Response:**

```json
{ "userId": "user_123", "status": "created" }
{ "userId": "user_123", "status": "updated" }
```

`created` on first call for a userId. `updated` on all subsequent calls.

---

## alias

Link an anonymous visitor ID to a known userId. Call this once at login — after you have both the `anonymousId` (from localStorage or equivalent) and the `userId` (returned by your auth system). Idempotent: a second call with the same `anonymousId` returns `exists` without inserting a duplicate.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | string | ✅ | The known user ID to link to |
| `anonymousId` | string | ✅ | The anonymous visitor ID to be merged |
| `source` | string | ✅ | |
| `version` | string | ✅ | |
| `eventId` | UUID | optional | |
| `timestamp` | ISO 8601 | optional | |

**Response:**

```json
{ "userId": "user_123", "anonymousId": "anon_abc", "status": "created" }
{ "userId": "user_123", "anonymousId": "anon_abc", "status": "exists" }
```

---

## batch

Send multiple track events in a single HTTP request. Reduces connection overhead for server-side event generation. Each element in the array follows the exact same shape as a `track` call.

**Input:**

```json
{
  "events": [
    { "event": "page.viewed", "source": "web", "version": "1.0", "userId": "user_123", "properties": {} },
    { "event": "product.viewed", "source": "web", "version": "1.0", "userId": "user_123", "properties": {} }
  ]
}
```

- Minimum 1 event. Throw if array is empty.
- Maximum 100 events per call. Throw if array exceeds 100.
- Each event is validated individually. If event at index 2 has a missing `source`, throw: `"batch[2]: source is required"`.

**Response:**

```json
{
  "accepted": 2,
  "duplicates": 0,
  "results": [
    { "eventId": "uuid-1", "status": "accepted" },
    { "eventId": "uuid-2", "status": "accepted" }
  ]
}
```

---

## HTTP Contract

Every request must send:

```
POST {host}{path}
Content-Type: application/json
x-api-key: {apiKey}
```

The API key goes in the `x-api-key` header. Never in the URL, never in the request body.

All endpoints return `202 Accepted` on success. Treat any `2xx` as success.

---

## Retry and Error Behaviour

| Response | Action |
|---|---|
| `2xx` | Return result. Do not retry. |
| `429 Too Many Requests` | Retry with exponential backoff. Honour `Retry-After` header if present. |
| `5xx Server Error` | Retry with exponential backoff up to `maxRetries`. |
| `4xx` (except 429) | Throw immediately. No retry. These are caller errors. |
| Timeout | Treat as transient. Retry up to `maxRetries`. |
| Network error | Retry up to `maxRetries`. |

**Backoff formula:** `delay = 500ms * 2^(attempt - 1)` capped at 30 seconds, with ±20% random jitter.

After all retries are exhausted, throw a descriptive error that includes the HTTP status or error message of the last attempt.

---

## Client-Side Validation

Validate required fields before making any network call. Throw immediately on missing fields — do not send a request that will return `400`.

| Method | Required fields |
|---|---|
| `track` | `event`, `source`, `version`, `userId` or `anonymousId` |
| `identify` | `userId`, `source`, `version` |
| `alias` | `userId`, `anonymousId`, `source`, `version` |
| `batch` | array must not be empty; each element validated as track |

Error message must name the field: `"FlowMesh: source is required"` not `"invalid input"`.

For batch, prefix with the index: `"FlowMesh: batch[2]: event is required"`.

---

## Test Coverage

Every SDK must have tests covering the following cases for each method:

### Constructor
- Empty `apiKey` → throws on construction, no network call made
- Trailing slash on `host` is stripped

### Each method (track, identify, alias)
- Happy path → returns correct response shape
- Posts to the correct endpoint
- Sends `x-api-key` header
- Missing required field → throws, no network call made
- `5xx` → retries, succeeds on second attempt
- Persistent `5xx` → throws after `maxRetries` attempts
- `4xx` (400, 401) → throws immediately, exactly 1 network call made

### batch additionally
- Empty array → throws before network call
- Over 100 elements → throws before network call
- Validation error at index N → throws naming the index

Coverage threshold: 80% statements, branches, and functions.

---

## page

First-class page view. The `event` field is set to `page.viewed` automatically — callers provide the page title and optional URL instead.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Page title, e.g. `"Checkout"`, `"Product Detail"` |
| `url` | string | optional | Full page URL |
| `source` | string | ✅ | Origin: `web`, `mobile`, etc. |
| `version` | string | ✅ | Schema version |
| `userId` | string | one-of | Required if `anonymousId` absent |
| `anonymousId` | string | one-of | Required if `userId` absent |
| `sessionId` | string | optional | |
| `eventId` | UUID | optional | Idempotency key |
| `timestamp` | ISO 8601 | optional | |
| `context` | object | optional | |

**Response:** same shape as `track` — `{ eventId, status: "accepted" | "duplicate" }`.

---

## group

Associate a `userId` with an organisation or account. Subsequent calls for the same `groupId + userId` pair update the stored traits (upsert).

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `groupId` | string | ✅ | The organisation or account ID |
| `userId` | string | ✅ | The user being associated with the group |
| `source` | string | ✅ | |
| `version` | string | ✅ | |
| `traits` | object | optional | Group attributes: `name`, `plan`, `industry`, `size`, etc. |
| `eventId` | UUID | optional | |
| `timestamp` | ISO 8601 | optional | |
| `context` | object | optional | |

**Response:**

```json
{ "groupId": "acme-corp", "userId": "user_123", "status": "created" }
{ "groupId": "acme-corp", "userId": "user_123", "status": "updated" }
```

`created` on first call for this groupId + userId pair. `updated` on all subsequent calls.

---

## Planned Methods (post-launch)

Future methods added here before implementation begins:

---

## Adding a New SDK

1. Read this document fully before writing any code.
2. Use `packages/sdk-node/` as the reference implementation.
3. Method names, input field names, response field names, and error message format must match exactly (modulo language conventions for casing).
4. All test cases from the Test Coverage section must pass before the SDK is published.
5. Write a `README.md` covering: install, initialisation, one example per method, error handling, link to this document.
6. Open a PR to add the SDK to the monorepo root `README.md` SDKs section.

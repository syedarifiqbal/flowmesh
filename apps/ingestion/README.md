# Ingestion Service

The ingestion service is FlowMesh's event entrypoint. It receives client events over HTTP, validates the request schema, deduplicates events by `eventId`, persists the raw event, and publishes the event to RabbitMQ for downstream processing.

## Responsibilities

- Receive single events and event batches over HTTP
- Validate request payloads before accepting them
- Deduplicate events using `eventId`
- Persist accepted events to the ingestion database schema
- Publish accepted events to RabbitMQ for the pipeline service

## API

### `POST /events`

Accepts a single event and returns `202 Accepted`.

Required header:

- `x-workspace-id`: workspace identifier used to scope the event

Response shape:

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "accepted"
}
```

If the same `eventId` has already been processed, the service returns:

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "duplicate"
}
```

Example request:

```bash
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -H "x-workspace-id: workspace_demo" \
  -d '{
    "event": "user.signed_up",
    "correlationId": "550e8400-e29b-41d4-a716-446655440001",
    "source": "web",
    "version": "1.0",
    "userId": "user_123",
    "properties": {
      "plan": "free"
    }
  }'
```

### `POST /events/batch`

Accepts up to 100 events and returns `202 Accepted` with per-event results.

Required header:

- `x-workspace-id`: workspace identifier used to scope the events

Response shape:

```json
{
  "accepted": 2,
  "duplicates": 0,
  "results": [
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440010",
      "status": "accepted"
    },
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440011",
      "status": "accepted"
    }
  ]
}
```

Example request:

```bash
curl -X POST http://localhost:3001/events/batch \
  -H "Content-Type: application/json" \
  -H "x-workspace-id: workspace_demo" \
  -d '{
    "events": [
      {
        "event": "page.viewed",
        "correlationId": "550e8400-e29b-41d4-a716-446655440002",
        "source": "web",
        "version": "1.0",
        "anonymousId": "anon_123",
        "properties": {
          "page": "/pricing"
        }
      },
      {
        "event": "button.clicked",
        "correlationId": "550e8400-e29b-41d4-a716-446655440003",
        "source": "web",
        "version": "1.0",
        "userId": "user_123",
        "properties": {
          "button": "start-trial"
        }
      }
    ]
  }'
```

### `GET /health`

Returns service health.

Response shape:

```json
{
  "status": "ok"
}
```

## Event schema

Each event payload supports these fields:

- `event` (required): lowercase dot-notation event name, for example `order.created`
- `correlationId` (required): UUIDv4 request correlation identifier
- `eventId` (optional): UUIDv4 idempotency key. If omitted, the service generates one
- `timestamp` (optional): ISO 8601 timestamp. If omitted, the service uses the current server time
- `source` (required): event origin, for example `web`, `mobile`, or `server`
- `version` (required): event schema version
- `userId` or `anonymousId` (at least one required): subject identifier
- `sessionId` (optional): client session identifier
- `properties` (optional): arbitrary event payload
- `context` (optional): request or environment metadata

## Environment variables

The service validates these environment variables at startup:

- `NODE_ENV`: `development`, `production`, or `test` (defaults to `development`)
- `PORT`: HTTP port for the NestJS server (defaults to `3001`)
- `DATABASE_URL`: PostgreSQL connection string, must include `?schema=ingestion`
- `RABBITMQ_URL`: RabbitMQ connection string used for publishing accepted events
- `REDIS_PERSISTENT_URL`: Redis connection string used for idempotency state
- `REDIS_EPHEMERAL_URL`: Required by startup validation, but not actively used by this service in the current version

## Run locally

From the repository root:

```bash
make ingestion-migrate && make ingestion-dev
```

This applies Prisma migrations, regenerates the Prisma client, and starts the ingestion service in watch mode.

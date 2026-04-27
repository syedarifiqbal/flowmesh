# Config Service

The config service stores workspace-scoped pipeline definitions and destination credentials for Flowmesh.

## Responsibilities

- Store pipeline configurations used by the pipeline executor
- Cache pipeline definitions for faster reads
- Store destination credentials encrypted at rest
- Expose CRUD APIs for pipelines and destinations
- Expose a health check endpoint

## Security model

Destination credentials are encrypted before they are written to the database.

Important: destination credentials are write-only after creation. The API never returns plaintext destination config or the encryption IV in any response.

## Environment variables

The service validates these environment variables at startup:

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | No, defaults to `development` | Runtime environment. Allowed values: `development`, `production`, `test`. |
| `PORT` | No, defaults to `3002` | HTTP port for the service. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. It must include `?schema=config`. |
| `REDIS_EPHEMERAL_URL` | Yes | Redis connection string used for cached pipeline definitions. |
| `CONFIG_ENCRYPTION_KEY` | Yes | 64-character hex key used to encrypt destination credentials at rest. |

## Run locally

Generate a local encryption key first:

```bash
make gen-encryption-key
```

Then set the required environment variables and start the service:

```bash
make config-migrate && make config-dev
```

## API

All pipeline and destination endpoints require the `x-workspace-id` header.

### `GET /health`

Returns the service health status.

### Pipeline API

Base path: `/pipelines`

#### `POST /pipelines`

Create a pipeline.

Request body:

```json
{
  "name": "Orders to Slack",
  "description": "Send new order events to Slack",
  "trigger": {
    "type": "event",
    "events": ["order.created"]
  },
  "steps": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "type": "filter",
      "name": "Only high-value orders",
      "config": {
        "minTotal": 1000
      }
    },
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "type": "destination",
      "name": "Slack destination",
      "config": {
        "destinationId": "33333333-3333-3333-3333-333333333333"
      }
    }
  ],
  "enabled": true
}
```

#### `GET /pipelines`

List all pipelines for a workspace.

#### `GET /pipelines/:id`

Fetch one pipeline by ID.

#### `PUT /pipelines/:id`

Update any of these fields: `name`, `description`, `trigger`, `steps`, `enabled`.

#### `DELETE /pipelines/:id`

Delete a pipeline.

### Destination API

Base path: `/destinations`

Supported destination types:

- `postgres`
- `mysql`
- `slack`
- `discord`
- `webhook`
- `s3`
- `email`
- `elasticsearch`

#### `POST /destinations`

Create a destination.

Request body:

```json
{
  "name": "Slack alerts",
  "type": "slack",
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/T000/B000/XXXX"
  }
}
```

#### `GET /destinations`

List all destinations for a workspace.

Response objects include metadata such as `id`, `workspaceId`, `name`, `type`, `createdAt`, and `updatedAt`, but never plaintext config or IV values.

#### `GET /destinations/:id`

Fetch one destination by ID.

#### `PUT /destinations/:id`

Update any of these fields: `name`, `type`, `config`.

If `config` is updated, the service re-encrypts the new destination credentials before storing them.

#### `DELETE /destinations/:id`

Delete a destination.

## Sample requests

### Create a pipeline

```bash
curl -X POST http://localhost:3002/pipelines \
  -H 'Content-Type: application/json' \
  -H 'x-workspace-id: demo-workspace' \
  -d '{
    "name": "Orders to Slack",
    "description": "Send new order events to Slack",
    "trigger": {
      "type": "event",
      "events": ["order.created"]
    },
    "steps": [
      {
        "id": "11111111-1111-1111-1111-111111111111",
        "type": "destination",
        "name": "Slack destination",
        "config": {
          "destinationId": "33333333-3333-3333-3333-333333333333"
        }
      }
    ],
    "enabled": true
  }'
```

### Create a destination

```bash
curl -X POST http://localhost:3002/destinations \
  -H 'Content-Type: application/json' \
  -H 'x-workspace-id: demo-workspace' \
  -d '{
    "name": "Slack alerts",
    "type": "slack",
    "config": {
      "webhookUrl": "https://hooks.slack.com/services/T000/B000/XXXX"
    }
  }'
```
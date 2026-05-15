# Alert Service

The alert service evaluates rules against the incoming event stream and fires notifications when conditions are met. It runs independently of the delivery service — notifications are sent directly via HTTP, not through the pipeline.

## Responsibility

- Consume every ingested event from RabbitMQ (`flowmesh.events` exchange, fan-out alongside the pipeline)
- Evaluate each event against all enabled alert rules for the workspace
- Send notifications via Slack, Webhook, or Email when a rule matches
- Record every notification attempt (sent or failed) in the alert history
- Expose a REST API for managing rules and querying history

## Architecture

```
Ingestion → RabbitMQ (flowmesh.events exchange)
                         │
                         ├── Pipeline service (separate consumer)
                         └── Alert service (separate consumer, this service)
                                    │
                                    ├── EvaluatorService (matches rules)
                                    │        ├── any_event       → always matches
                                    │        ├── property_equals → matches on payload value
                                    │        └── count_threshold → Redis fixed-window counter
                                    │
                                    ├── SlackNotifier  (HTTP to Slack Incoming Webhook)
                                    ├── WebhookNotifier (HTTP POST to user URL)
                                    └── EmailNotifier  (SMTP via nodemailer)
```

## Condition Types

| Type | Description |
|---|---|
| `any_event` | Fires every time a matching event arrives (optionally filtered by event name) |
| `property_equals` | Fires when a specific property in the event payload matches a value |
| `count_threshold` | Fires once per time window when N or more events have arrived |

The count threshold uses Redis for fixed-window counting. Two keys per rule per window:
- `alert:count:{ruleId}:{bucket}` — incremented on every event
- `alert:fired:{ruleId}:{bucket}` — set with NX semantics so the alert fires only once per window

## Notification Channels

| Channel | Config |
|---|---|
| Slack | `slackWebhookUrl` — Slack Incoming Webhook URL |
| Webhook | `webhookUrl` — any HTTPS endpoint; receives a JSON POST |
| Email | `recipientEmail` — requires SMTP configuration |

## API Contract

All routes require `x-workspace-id` and `x-api-key` headers (set by the gateway).

### Alert Rules

| Method | Path | Description |
|---|---|---|
| `POST` | `/alert-rules` | Create a new rule |
| `GET` | `/alert-rules` | List all rules for the workspace |
| `GET` | `/alert-rules/:id` | Get a single rule |
| `PATCH` | `/alert-rules/:id` | Update a rule |
| `PATCH` | `/alert-rules/:id/toggle` | Enable or disable a rule |
| `POST` | `/alert-rules/:id/test` | Send a test notification immediately |
| `DELETE` | `/alert-rules/:id` | Delete a rule and its history |

### Alert History

| Method | Path | Description |
|---|---|---|
| `GET` | `/alert-rules/history` | Paginated list of all past notifications |

Query params for history: `limit` (default 20, max 100), `offset` (default 0), `ruleId` (filter by rule).

### Create Rule — Request Body

```json
{
  "name": "High error rate",
  "description": "Optional description",
  "conditionType": "count_threshold",
  "eventName": "error.reported",
  "thresholdCount": 10,
  "windowSeconds": 60,
  "channel": "slack",
  "slackWebhookUrl": "https://hooks.slack.com/services/..."
}
```

`conditionType` values: `any_event`, `property_equals`, `count_threshold`

`channel` values: `slack`, `webhook`, `email`

Channel-specific fields:
- `slack` requires `slackWebhookUrl`
- `webhook` requires `webhookUrl`
- `email` requires `recipientEmail`

Condition-specific fields:
- `property_equals` requires `propertyPath` and `propertyValue`
- `count_threshold` requires `thresholdCount` (≥ 1) and `windowSeconds` (≥ 10)

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string (schema=alert) |
| `RABBITMQ_URL` | ✅ | — | RabbitMQ connection string |
| `REDIS_EPHEMERAL_URL` | ✅ | — | Redis for count_threshold counters |
| `PORT` | — | `3007` | HTTP server port |
| `NODE_ENV` | — | `development` | Environment |
| `SMTP_HOST` | — | `""` | SMTP hostname (required to use email channel) |
| `SMTP_PORT` | — | `587` | SMTP port |
| `SMTP_USER` | — | `""` | SMTP username |
| `SMTP_PASS` | — | `""` | SMTP password |
| `SMTP_FROM` | — | `alerts@flowmesh.io` | Sender address |

## Running Locally

```bash
# Start infrastructure
make infra-up

# Run migrations
make alert-migrate

# Start the service
make alert-dev
```

## Health Check

```
GET /health → { "status": "ok" }
```

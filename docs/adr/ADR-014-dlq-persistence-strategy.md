# ADR-014: DLQ Persistence Strategy — Database-Backed over RabbitMQ Direct Read

**Date:** 2026-05-08
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

The delivery service routes events to a RabbitMQ dead-letter exchange (`flowmesh.dlq`) when max retries are exceeded. The dashboard needs a DLQ viewer so operators can inspect failed deliveries and replay them manually.

Two approaches were considered for surfacing this data to the dashboard:

**Option A — Read directly from RabbitMQ management API:** Use the RabbitMQ HTTP management API (`GET /api/queues/{vhost}/{queue}/get`) to peek at messages in the DLQ queue and re-publish them via the management API for replay.

**Option B — Persist to PostgreSQL on failure:** When the delivery service exhausts all retries, write a row to `delivery.dead_letter_events` before nacking. Expose REST endpoints from the delivery service for listing and replaying entries.

## Decision

Use **Option B — database-backed persistence**.

The delivery service writes to `delivery.dead_letter_events` immediately before the final `Nack`. Two REST endpoints are added to the delivery service HTTP server:
- `GET /dlq` — paginated list of failed events, filtered by `x-workspace-id` header
- `POST /dlq/:id/replay` — re-publishes the stored payload to the pipeline delivery queue and records `replayed_at`

The gateway proxies `dlq*` requests to the delivery service under the existing `ManagementController`.

## Consequences

### Positive
- Full audit trail of every failed delivery. Rows survive replay — `replayed_at` records when a message was re-queued, enabling visibility into which events have already been retried
- Proper multi-tenancy: `workspace_id` column allows the viewer to show only the failures relevant to the authenticated user. The RabbitMQ queue is shared across all workspaces with no per-tenant filtering
- Standard SQL pagination (`LIMIT / OFFSET`) and filtering by event type, destination, or time range — the RabbitMQ management API provides neither
- Non-destructive reads: fetching the list does not consume or alter any messages. Replay is an explicit, intentional write operation
- `pgx/v5` is already a declared dependency of the delivery service — no new infrastructure required

### Negative
- Extra Postgres write on every delivery failure. At realistic failure rates this overhead is negligible, but it does mean a database availability issue could cause DLQ writes to fail silently. The nack to RabbitMQ still happens regardless, so no events are lost — only the audit record is missing
- The delivery service gains a Postgres dependency. It previously had no database connection. Plain `pgx/v5` is used directly (no ORM) to keep the service thin

### Neutral
- Migrations for the `delivery` schema are plain SQL files applied via `make delivery-migrate` (psql), not Prisma — Prisma is a Node.js tool and cannot run inside the Go service
- The delivery service connects to PostgreSQL directly (not via PgBouncer) for simplicity — the DLQ write rate is low and does not justify the connection pooler hop

## Alternatives Considered

### RabbitMQ Management API Direct Read
The RabbitMQ HTTP management API exposes `GET /api/queues/{vhost}/{queue}/get` which peeks at or destructively consumes messages from a queue. This is simple to implement and requires no database changes.

It was rejected for three reasons: (1) the `get` operation is not safe for production use at scale — RabbitMQ's documentation explicitly notes it is for management and debugging, not application use; (2) it is destructive by default — a bug in the viewer could drain the DLQ; (3) there is no per-workspace filtering, so all workspaces see all failures, which is both a UX problem and a data isolation concern.

### Separate DLQ Consumer Service
An alternative was to run a dedicated NestJS consumer that subscribes to the `flowmesh.dlq` exchange, persists each message to Postgres, and exposes the REST API. This would keep the Go delivery service free of database concerns.

It was rejected because it introduces an extra service, extra deployment complexity, and an extra failure point (if the consumer is down, DLQ messages are not persisted). Having the delivery service write directly before nacking is simpler and more reliable — the write and the nack happen in the same process with no network hop between them.

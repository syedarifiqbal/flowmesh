# ADR-002: Go for the Delivery Service

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

The Delivery service consumes events from RabbitMQ and delivers them
to destinations: PostgreSQL, Slack, S3, webhooks, Discord. Each
delivery involves a network I/O call — an HTTP request or a database
write. Under load the service handles hundreds of concurrent deliveries
simultaneously, each waiting on a remote response.

All other FlowMesh services are written in NestJS + TypeScript. The
question is whether to write Delivery in the same stack or use a
different language better suited to its workload profile.

## Decision

Implement the Delivery service in Go.

## Implementation Model

Each message consumed from RabbitMQ spawns a goroutine. A semaphore
limits maximum concurrent deliveries to prevent memory exhaustion
under burst traffic.

Goroutine lifecycle:
consume message → acquire semaphore slot
→ attempt delivery with explicit timeout
→ success: ack message, release slot
→ failure: exponential backoff retry
→ max retries exceeded: publish to DLQ, ack original, release slot

This model requires no external concurrency framework — the Go
standard library provides everything needed via goroutines, channels,
sync.Semaphore, and context cancellation.

## Selected Libraries

| Concern | Library | Reason |
|---|---|---|
| RabbitMQ client | github.com/rabbitmq/amqp091-go | Official client, actively maintained |
| Circuit breaker | github.com/sony/gobreaker | Simple API, well-tested in production |
| Exponential backoff | github.com/cenkalti/backoff/v4 | Context-aware, jitter support |
| HTTP client | net/http stdlib | No external dependency needed |
| Structured logging | log/slog stdlib | Available Go 1.21+, zero dependency |

## Type Sharing Strategy

`docs/event-schema.md` is the single source of truth for the event
structure. TypeScript types live in `packages/shared-types/src/event.ts`.
Go types live in `apps/delivery/internal/types/event.go`. Both are
manually kept in sync against the schema document.

A future improvement would generate both from a shared JSON Schema or
Protobuf definition — tracked as a separate decision when the schema
stabilizes and the maintenance burden justifies it.

## Consequences

### Positive

- Go goroutines cost ~2KB stack each. On a 512MB container the service
  sustains thousands of concurrent deliveries — equivalent to 3-5
  Node.js replicas from a single binary
- One binary, no runtime dependency — smaller Docker image, faster
  cold start than a Node.js service
- Go's explicit error handling forces every delivery failure path to
  be handled — failures cannot be accidentally swallowed
- The sync and context packages make circuit breaker, semaphore, and
  timeout logic straightforward and correct without external frameworks
- Deliberate learning opportunity — Go is expected at senior backend
  level and opens doors in the platform engineering space

### Negative

- Adds a second language to the monorepo — contributors need Go
  knowledge to work on Delivery
- Cannot share TypeScript types from @flowmesh/shared-types directly —
  requires maintaining parallel struct definitions (mitigated by
  keeping docs/event-schema.md as the single source of truth)
- Learning Go during implementation — initial velocity will be lower
  than building in NestJS

### Neutral

- The Delivery service has a narrow, well-defined contract: consume a
  message, call a destination, ack or nack. This limits the surface
  area where Go knowledge is required to a single service
- The service scales horizontally by adding replicas consuming from
  the same RabbitMQ queue — no architectural change needed if
  throughput demands grow

## Alternatives Considered

### NestJS + TypeScript

Node.js handles I/O concurrency well with its event loop, but truly
parallel outbound HTTP calls under sustained load require careful
Promise chain management and connection pool tuning. Achieving the
same concurrent delivery throughput as a single Go binary would
require multiple Node.js replicas, adding operational complexity
without technical benefit.

### Rust

Better performance ceiling than Go. However the learning curve is
steeper, the ecosystem for HTTP clients and AMQP consumers is less
mature, and the productivity gains over Go for this specific use case
are marginal. The risk-to-reward ratio favors Go.
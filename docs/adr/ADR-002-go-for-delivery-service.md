# ADR-002: Go for the Delivery Service

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

The Delivery service consumes events from RabbitMQ and delivers them to destinations: PostgreSQL, Slack, S3, webhooks, Discord. Each delivery involves a network I/O call — an HTTP request or a database write. Under load, the service may be handling hundreds of concurrent deliveries simultaneously, each waiting on a remote response.

All other FlowMesh services are written in NestJS + TypeScript. The question is whether to write Delivery in the same stack or use a different language.

## Decision

Implement the Delivery service in Go.

## Consequences

### Positive
- Go goroutines handle thousands of concurrent I/O operations with minimal memory — each goroutine costs ~2KB stack vs Node.js's event loop model which struggles with truly parallel blocking I/O
- One Go binary with no runtime dependency — smaller Docker image, faster cold start
- Go's explicit error handling forces every delivery failure to be handled, not accidentally swallowed
- The `sync` and `context` packages make circuit breaker and timeout implementation straightforward and correct
- Deliberate learning opportunity — Go is a commonly expected skill for senior backend engineers and opens doors in the DevOps/platform space

### Negative
- Adds a second language to the monorepo — contributors need Go knowledge to work on Delivery
- Cannot share TypeScript types from `@flowmesh/shared-types` directly — requires maintaining parallel struct definitions or generating Go types from a schema
- Arif is learning Go during implementation — initial velocity will be lower

### Neutral
- The Delivery service has a narrow, well-defined contract: consume a message, call a destination, ack or nack. This boundary limits the surface area where Go knowledge is required.
- Go types for FlowMesh events will be defined in the Go module's own `types/` package, derived from `docs/event-schema.md` as the source of truth

## Alternatives Considered

### NestJS + TypeScript (same as other services)
Node.js handles I/O concurrency well with its event loop, but truly parallel outbound HTTP calls require careful management of connection pools and Promise chains. Under sustained load delivering to multiple slow destinations simultaneously, Node.js would require more replicas to achieve the same throughput as a single Go binary.

### Rust
Rust would offer even better performance than Go. However, the learning curve is steeper, the ecosystem for HTTP clients and queue consumers is less mature, and the productivity gains over Go for this use case are marginal.

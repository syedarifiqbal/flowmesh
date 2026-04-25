# ADR-003: Two Redis Instances with Different Persistence Configurations

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

FlowMesh uses Redis for several distinct purposes: rate limiting counters, pipeline config cache, pub/sub for the live dashboard WebSocket feed, session data, token blacklist (revoked JWTs and API keys), and idempotency keys (processed event IDs).

These use cases have fundamentally different durability requirements. Rate limit counters and pub/sub messages are inherently ephemeral — losing them on a container restart is acceptable. Token blacklists and idempotency keys must survive restarts — a revoked token that reappears after a Redis restart is a security vulnerability, and re-processing an event that was already delivered is a correctness violation.

## Decision

Run two Redis instances in Docker Compose with different configurations:

**Redis 1 — ephemeral**
- `maxmemory-policy: allkeys-lru` (evicts least-recently-used keys when memory is full)
- No persistence (no RDB snapshots, no AOF)
- Stores: rate limit counters, pipeline config cache, pub/sub, session data

**Redis 2 — persistent**
- AOF (Append Only File) persistence enabled — `appendfsync: everysec`
- No eviction policy — data must never be silently dropped
- Stores: token blacklist, idempotency keys, workspace quota tracking

## Consequences

### Positive
- Eliminates the conflict between "evict freely" (cache) and "never lose data" (blacklist/idempotency) — each instance is configured optimally for its role
- A misconfigured eviction policy on a single Redis cannot silently drop idempotency keys, enabling duplicate event processing
- A revoked token cannot reappear after a restart of the persistent instance
- AOF adds minimal latency overhead (`everysec` syncs once per second, not on every write)

### Negative
- Two Redis containers instead of one — adds ~50MB RAM and a small amount of operational complexity
- Developers must know which Redis to use for which data — documented in CLAUDE.md and code-standards rules

### Neutral
- Both instances are accessed via separate environment variables (`REDIS_EPHEMERAL_URL`, `REDIS_PERSISTENT_URL`)
- PgBouncer-style connection pooling is not needed for Redis — Redis handles concurrent connections efficiently

## Alternatives Considered

### Single Redis with AOF enabled
Enabling AOF on a single instance that also handles rate limiting would cause unnecessary disk I/O for ephemeral data. More importantly, setting a `maxmemory-policy` on a Redis that stores idempotency keys risks silently evicting those keys under memory pressure, causing duplicate event delivery.

### Single Redis with key TTLs and no eviction
Setting TTLs on all keys and disabling eviction avoids the eviction problem but does not protect against data loss on restart for the token blacklist and idempotency keys.

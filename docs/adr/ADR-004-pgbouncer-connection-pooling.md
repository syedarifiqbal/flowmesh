# ADR-004: PgBouncer for PostgreSQL Connection Pooling

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

FlowMesh runs 8+ NestJS services, each maintaining a connection pool to PostgreSQL. PostgreSQL has a hard limit on concurrent connections — typically 100 on a default configuration — and each connection consumes ~5–10MB of server memory. Under load, with multiple replicas of Ingestion and Delivery running, the total number of database connections can exhaust PostgreSQL's limits, causing new connection attempts to fail.

## Decision

Route all database connections through PgBouncer in transaction pooling mode. No service connects directly to PostgreSQL.

## Consequences

### Positive
- PgBouncer multiplexes many application connections into a small pool of real PostgreSQL connections — 8 services with 10 connections each (80 total) can be served by a PgBouncer pool of 20 real connections
- Protects PostgreSQL from connection exhaustion under load — the database stays healthy even when the application tier scales horizontally
- PgBouncer is transparent to the application — services connect to PgBouncer using the standard PostgreSQL protocol and connection string
- Transaction pooling mode is compatible with TypeORM, Prisma, and raw `pg` clients

### Negative
- Transaction pooling mode does not support PostgreSQL session-level features: prepared statements (must be disabled in client config), `SET` commands that persist across transactions, advisory locks held across transactions
- Adds one more component to the Docker Compose stack
- In transaction pooling mode, `LISTEN`/`NOTIFY` is not supported — any pub/sub using PostgreSQL's native mechanism must use Redis pub/sub instead (which FlowMesh already does)

### Neutral
- PgBouncer is configured as a sidecar alongside PostgreSQL in Docker Compose — both run on the same container network
- Connection strings in all services point to PgBouncer's port (5432 by convention) not PostgreSQL's actual port (5433 in our Docker Compose setup)

## Alternatives Considered

### Direct PostgreSQL connections from each service
Acceptable at development scale but fails under production load. With 5+ replicas of Ingestion each holding a 10-connection pool, PostgreSQL connection limits are easily hit.

### Application-level connection pooling only (no PgBouncer)
Each ORM/driver has its own pool, but those pools cannot share connections across services. PgBouncer provides a single shared pool across all services, which is more efficient.

### pgpool-II
More feature-rich than PgBouncer but significantly more complex to configure. PgBouncer does exactly what FlowMesh needs with minimal configuration.

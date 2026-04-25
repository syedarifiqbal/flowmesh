# ADR-008: Database Strategy — Schema Per Service on Shared PostgreSQL Instance

**Status:** Accepted  
**Date:** 2026-04-25

---

## Context

FlowMesh is a microservices system with 8 services, several of which require persistent relational storage (ingestion, auth, config, analytics, alert). We need to decide how to allocate database resources across services.

Three options were considered:

**Option A — Shared database, shared schema**  
All services connect to the same PostgreSQL instance and the same schema. Tables from all services are visible to all services.

**Option B — Schema per service (chosen)**  
One PostgreSQL instance. Each service owns a dedicated schema (`?schema=ingestion`, `?schema=auth`, etc.). Services can only access their own schema via their connection string.

**Option C — Database per service**  
Each service runs against its own PostgreSQL instance (separate container, separate volume, separate connection pool).

---

## Decision

**Option B — schema per service on a single PostgreSQL instance**, accessed through PgBouncer.

Each service's `DATABASE_URL` includes `?schema=<service>`:

```
postgresql://flowmesh:<password>@pgbouncer:5432/flowmesh?schema=ingestion
postgresql://flowmesh:<password>@pgbouncer:5432/flowmesh?schema=auth
postgresql://flowmesh:<password>@pgbouncer:5432/flowmesh?schema=config
```

Prisma uses the schema parameter to scope all migrations and queries to that namespace. A service cannot query another service's tables without explicitly changing its connection string — enforced by convention and deployment configuration.

---

## Why Not Option A (Shared Schema)

- No ownership boundaries — any service can JOIN any table
- Schema migrations from one service can silently break queries in another
- Impossible to reason about which service is responsible for which table
- Unacceptable for a system designed to grow to 8+ services

---

## Why Not Option C (Database Per Service)

- **Operational cost**: 5–6 PostgreSQL containers on a $20/month VPS is not viable. Each instance needs its own volume, memory allocation, backup job, and connection pooler
- **Target audience**: FlowMesh Community Edition targets solo developers and small teams self-hosting with Docker Compose. Asking them to manage 6 database containers is a barrier to adoption
- **Team structure does not require it**: Database-per-service pays off when separate teams own separate services and need to deploy schema changes independently without coordination. FlowMesh is a single monorepo, single team
- **The isolation benefit is achieved by schema**: Cross-service data access still requires an API call, not a direct query. Schema namespacing enforces the same logical boundary without the operational cost

---

## Consequences

**Positive**
- Single PostgreSQL container — simple Docker Compose setup, easy to back up, easy to monitor
- Logical service isolation — services cannot accidentally cross schema boundaries
- Independent migrations — each service runs `prisma migrate deploy` against its own schema; no coordination needed
- All schemas benefit from one PgBouncer pool (see ADR-004)

**Negative**
- A misconfigured `DATABASE_URL` (missing `?schema=`) would land queries in the default `public` schema, silently mixing data. Must be caught in the Joi config validation at startup
- A runaway query in one service can impact database performance for other services (no hard resource isolation between schemas). Acceptable at Community Edition scale
- Schema-level access control requires PostgreSQL roles per service if stricter isolation is needed in future (currently not enforced — enforced by convention)

---

## FlowMesh Cloud Consideration

**This strategy is not directly applicable to FlowMesh Cloud.**

FlowMesh Cloud is a multi-tenant managed service where thousands of customer workspaces run on shared infrastructure. The isolation requirements are fundamentally different:

- Enterprise customers may have GDPR or compliance requirements that prohibit sharing a database instance with other customers
- A single PostgreSQL instance cannot scale to thousands of tenants without dedicated sharding infrastructure

FlowMesh Cloud will use a **tiered isolation model**:

| Tier | Strategy | Why |
|---|---|---|
| Community / Pro tenants | Shared tables with `workspace_id` column + PostgreSQL Row-Level Security (RLS) | Cost-efficient, scales to thousands of tenants on shared infrastructure |
| Enterprise tenants | Dedicated schema or dedicated PostgreSQL cluster | Compliance, performance SLA, and data sovereignty requirements |

Row-Level Security enforces that a workspace can only read and write its own rows at the database level — not just in application code. This is the approach used by Supabase, Neon, and most multi-tenant SaaS platforms at scale.

The schema-per-service pattern still applies in FlowMesh Cloud for the service boundary dimension. The tenant isolation dimension is handled separately via RLS within each service's schema.

---

## Migration Path

If FlowMesh Community Edition ever needs to move to database-per-service (e.g., compliance requirements for a self-hosted enterprise customer), each service already has its own schema with its own migrations. The migration path is:

1. Provision a new PostgreSQL instance for the target service
2. Dump and restore that service's schema to the new instance
3. Update the service's `DATABASE_URL` to point to the new instance
4. No changes to the service code or migrations

The schema isolation makes this a data operation, not a code change.

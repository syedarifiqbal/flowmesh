# ADR-007: Prisma over TypeORM

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

FlowMesh needs an ORM for all NestJS services connecting to PostgreSQL. The two main candidates are TypeORM (the NestJS default) and Prisma.

## Decision

Use Prisma with a controlled migration workflow:
- `prisma migrate dev --create-only` to generate SQL without applying it
- Manual review of generated SQL before any apply
- `prisma migrate deploy` to apply reviewed migrations

`prisma migrate dev` without `--create-only` is banned — it auto-applies without review.

## Consequences

### Positive
- Prisma Client is fully typed — every query result has correct TypeScript types, no casting or `any`
- Schema is the single source of truth — one `schema.prisma` file per service defines the complete data model
- `--create-only` flag gives full control — SQL is reviewed before it touches any database
- Clean ORM mapping via `@map` and `@@map` — snake_case in database, camelCase in TypeScript, zero friction
- Prisma's migration history is clean and readable — one folder per migration, plain SQL files

### Negative
- Not the NestJS default — official NestJS docs use TypeORM, so community examples need mental translation
- Prisma does not support TimescaleDB `create_hypertable()` natively — requires manual addition to generated migration SQL
- Prisma Client adds ~5MB to the production bundle — acceptable for a server-side service

### Neutral
- Each service has its own `prisma/schema.prisma` and owns its own migrations
- `prisma generate` must be run after every schema change to keep the TypeScript client in sync

## Alternatives Considered

### TypeORM
More familiar to NestJS developers and better documented in the NestJS ecosystem. However, TypeORM's query builder has weaker type safety — complex queries can return `any`, which defeats the purpose of TypeScript strict mode. Decorator-based entity definitions also scatter the schema across multiple files, making it harder to see the full data model at a glance.

### Drizzle
Newer, TypeScript-native, very lightweight. Not mature enough for a production-grade project targeting acquisition. Ecosystem and community are still developing.

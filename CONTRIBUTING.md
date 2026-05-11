# Contributing to FlowMesh

Thank you for your interest in contributing. FlowMesh is an active open-source project and contributions of all kinds are welcome — bug reports, documentation improvements, new destination drivers, test coverage, and features.

---

## Before You Start

**Open an issue before starting significant work.** This lets us discuss the approach and avoids wasted effort if the direction needs adjustment. For small changes (typos, documentation, one-liners), just open a PR directly.

---

## What's Working Right Now

| Service / Area | Status |
|---|---|
| API Gateway — rate limiting, auth, routing | ✅ Complete |
| Ingestion — validation, idempotency, RabbitMQ publish | ✅ Complete |
| Pipeline — filter, transform, enrich, fan-out | ✅ Complete |
| Delivery (Go) — webhook, postgres, circuit breaker, retry, DLQ | ✅ Complete |
| Auth — JWT, API keys, workspaces | ✅ Complete |
| Config service — pipeline CRUD, encrypted destination credentials | ✅ Complete |
| Dashboard — pipelines, destinations, events, pipeline builder, live feed, DLQ replay | ✅ Complete |
| Analytics — WebSocket live feed | ✅ Complete |
| Alert service | 🔧 In progress |
| Slack / S3 / Discord destinations | 🔧 In progress |
| Node.js SDK | ⬜ Not started |

---

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8.15+
- Go 1.21+ (only if working on the delivery service)
- Docker and Docker Compose

### Setup

```bash
# Clone the repo
git clone https://github.com/syedarifiqbal/flowmesh.git
cd flowmesh

# Install Node.js dependencies
pnpm install

# Start all infrastructure (Postgres, Redis, RabbitMQ)
make infra-up

# Run migrations for the services you are working on
make ingestion-migrate
make auth-migrate
make config-migrate

# Start a service in watch mode
make ingestion-dev
```

### Running tests

```bash
# Unit tests across all services (must stay above 80% coverage)
make test

# Integration tests — requires running infrastructure
make test-integration

# Go tests (delivery service only)
cd apps/delivery && go test ./...
```

All must pass before opening a PR. CI runs the same checks automatically.

---

## Where to Find Something to Work On

### Good first issues

Look for issues labelled [`good first issue`](https://github.com/syedarifiqbal/flowmesh/labels/good%20first%20issue). These are self-contained and require no deep codebase knowledge. Examples:

- Add a `README.md` for a service (each is a separate, standalone issue)
- Improve an error message to include the field that failed validation
- Add a missing unit test for an edge case in an existing module
- Add a new filter operator to the pipeline executor (e.g. `regex`)

### Bigger contributions

For anything that touches multiple services, changes a data schema, or introduces a new pattern, open an issue first. The architecture has deliberate constraints (documented in `docs/adr/`) and aligning early is better than reworking late.

### Destination drivers

The Go delivery service (`apps/delivery`) has a clear pattern for adding new destination types. Each destination is a function that receives a config map and an event map. Look at `internal/destination/destination.go` for the existing webhook and PostgreSQL drivers as a reference. Good targets: Slack, S3, Discord.

---

## Project Structure

```
flowmesh/
├── apps/
│   ├── ingestion/          NestJS — receive events, validate, deduplicate, publish to RabbitMQ
│   ├── pipeline/           NestJS — filter / transform / enrich / fan-out
│   ├── delivery/           Go    — deliver to destinations, circuit breaker, retry, DLQ
│   ├── auth/               NestJS — JWT, API keys, workspaces
│   ├── api-gateway/        NestJS — rate limiting, auth, reverse proxy
│   ├── config-service/     NestJS — pipeline definitions, encrypted destination credentials
│   ├── analytics/          NestJS — metrics, WebSocket live feed
│   └── dashboard/          React  — full dashboard UI
├── packages/
│   ├── shared-types/       TypeScript interfaces shared across services
│   └── nestjs-common/      Shared NestJS modules (health, logging, RabbitMQ, cache keys)
├── docker/                 Docker Compose, Dockerfiles, init scripts
└── docs/
    └── adr/                Architecture Decision Records — read before proposing changes
```

Read the ADRs before proposing architectural changes. They document why specific decisions were made (RabbitMQ over Kafka, two Redis instances, Go for delivery, schema-per-service isolation, etc.).

---

## Code Standards

### TypeScript (all NestJS services)

- Strict mode — `strict: true` in every service tsconfig. No `any`, use `unknown` and narrow it.
- No `console.log` in production code — inject `PinoLogger` from `nestjs-pino` in services
- No commented-out code committed to the repo

### Shared NestJS infrastructure

Every NestJS service imports common infrastructure from `@flowmesh/nestjs-common`. Never copy these files into a service — always import from the package:

- `HttpExceptionFilter` — global exception handler
- `CorrelationIdMiddleware` — reads/generates `x-correlation-id`
- `HealthModule` — `GET /health`
- `CacheKeyModule` — namespaced Redis key builder
- `RabbitMqModule` — RabbitMQ connection with reconnect

If you change `nestjs-common`, rebuild it before starting dependent services:
```bash
pnpm --filter @flowmesh/nestjs-common build
```

### Go (delivery service)

- Format with `gofmt` before committing
- Wrap errors with context: `fmt.Errorf("delivering to slack: %w", err)`
- Never discard errors with `_` from meaningful operations
- Use goroutines for concurrent destination delivery — never sequential blocking calls

### Database migrations (Prisma)

Never run `prisma migrate dev` without `--create-only` — it auto-applies without review.

```bash
# 1. Generate the SQL file only (does NOT run it)
pnpm --filter @flowmesh/<service> prisma:migrate:create

# 2. Review the generated .sql file

# 3. Apply reviewed migrations
make <service>-migrate
```

Migrations are append-only — never edit a file after it has been applied anywhere.

### Testing

- Coverage threshold: **80% minimum** on statements, branches, and functions. CI blocks PRs that fall below this.
- Unit tests are colocated with source: `src/module.service.spec.ts`
- Integration tests use real infrastructure — no mocks for Postgres, RabbitMQ, or Redis
- Never share state between tests — each test sets up and tears down its own data

---

## Pull Request Guidelines

### Branch naming

```
feat/<short-description>    # new feature
fix/<short-description>     # bug fix
docs/<short-description>    # documentation only
chore/<short-description>   # tooling, dependencies
```

### Commit messages — Conventional Commits (enforced by pre-commit hook)

```
<type>(<scope>): <lowercase summary>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

Scopes: `ingestion`, `pipeline`, `delivery`, `auth`, `analytics`, `alert`, `config`, `gateway`, `dashboard`, `shared-types`, `nestjs-common`, `docker`, `makefile`, `ci`

Examples:
```
feat(delivery): add slack destination driver
fix(ingestion): idempotency key not written when eventId is auto-generated
docs(docs): add readme for ingestion service
test(pipeline): add coverage for enrich step with nested properties
```

### Before opening a PR

- [ ] `make test` passes
- [ ] `make test-integration` passes (if you changed a service)
- [ ] Coverage stays above 80% on modified services
- [ ] No `any` types in TypeScript
- [ ] No hardcoded secrets, URLs, or credentials
- [ ] New env vars added to `.env.example` with a comment explaining each one
- [ ] New destination drivers include tests for happy path and all error cases

---

## Questions?

Open a [GitHub Discussion](https://github.com/syedarifiqbal/flowmesh/discussions) for questions and design conversations.

For bugs or concrete feature requests, open an [issue](https://github.com/syedarifiqbal/flowmesh/issues).

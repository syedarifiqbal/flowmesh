# Contributing to FlowMesh

Thanks for your interest in contributing. FlowMesh is a self-hosted, open-source event pipeline platform — think Segment + Mixpanel + PagerDuty in one Docker deployment, free forever.

This guide covers everything you need to go from zero to your first merged PR.

---

## What's Working Right Now

Before you dive in, here is an honest picture of where things stand:

| Area | Status | Notes |
|------|--------|-------|
| Ingestion service | ✅ Complete | Schema validation, idempotency, RabbitMQ publish, 80%+ test coverage |
| Config service | ✅ Complete | Pipeline CRUD, destination credentials (AES-256-GCM encrypted), Redis cache |
| Docker Compose setup | ✅ Working | One command starts all infrastructure |
| Pipeline executor | ⬜ Not started | Filter / transform / enrich / fan-out — good place to contribute |
| Delivery service (Go) | ⬜ Not started | Destinations, circuit breaker, retry, DLQ |
| API Gateway | ⬜ Not started | Rate limiting, routing, token blacklist |
| Auth service | ⬜ Not started | JWT, API keys, workspaces |
| Analytics service | ⬜ Not started | Metrics aggregation, TimescaleDB |
| Alert service | ⬜ Not started | Alert rule evaluation |
| Dashboard (React) | ⬜ Not started | Real-time event feed, pipeline builder |
| Node.js SDK | ⬜ Not started | Client library for sending events |

**Phase 1 goal:** `POST /events` → Ingestion → RabbitMQ → Pipeline → Delivery → Destination (end-to-end working).

---

## How to Set Up Locally

### Prerequisites

- Node.js 20+
- pnpm 8.15+
- Docker and Docker Compose
- Go 1.22+ (only if working on the delivery service)

### 1. Clone and install

```bash
git clone https://github.com/syedarifiqbal/flowmesh.git
cd flowmesh
pnpm install
```

### 2. Set up environment variables

```bash
make env-setup
```

This copies `.env.example` into each service directory (`apps/ingestion/.env`, `apps/config-service/.env`, etc.) and creates a root `.env` for Docker infra passwords. Each service loads its own `.env` — there is no shared root env loader.

For secrets that need generated values:

```bash
make gen-jwt-secret        # generates JWT_SECRET and JWT_REFRESH_SECRET
make gen-encryption-key    # generates CONFIG_ENCRYPTION_KEY (AES-256-GCM, 32 bytes)
```

Paste the output into the relevant service `.env` file.

### 3. Start infrastructure

```bash
make infra-up
```

This starts PostgreSQL (port 5433), RabbitMQ (port 5672, management UI at 15672), Redis ephemeral (6379), and Redis persistent (6380) in Docker. Takes about 15 seconds on first run.

### 4. Run a service

```bash
# Ingestion — most complete service, start here
make ingestion-migrate
make ingestion-dev

# Config service
make config-migrate
make config-dev
```

- Ingestion API: `http://localhost:3001`
- Config API: `http://localhost:3002`

### 5. Send a test event

```bash
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -d '{
    "event": "user.signed_up",
    "correlationId": "req-abc123",
    "source": "web-app",
    "version": "1.0",
    "userId": "user-42",
    "properties": { "plan": "free" }
  }'
```

### Running tests

```bash
make test              # unit tests across all services
make test-integration  # integration tests (requires infra running)
make test-coverage     # coverage report
make test-watch        # watch mode during development
```

---

## Where to Find Something to Work On

### Good first issues

Look for issues labeled [`good first issue`](https://github.com/syedarifiqbal/flowmesh/labels/good%20first%20issue). These are scoped to a single file or module and do not require deep knowledge of the full system.

Examples of tasks that make good first contributions:

- Add a README for the ingestion service or config service (each is a standalone issue)
- Add a new filter operator to the pipeline executor (e.g. `contains`, `regex`)
- Add a new delivery destination to the Go delivery service (e.g. Discord, email)
- Improve an error message to include the field name that failed validation
- Add a missing unit test for an edge case in an existing module

### Bigger contributions

For anything that touches multiple services, changes a data schema, or introduces a new pattern — open an issue or start a discussion before writing code. The architecture has deliberate constraints (see `docs/adr/`) and aligning early is better than reworking late.

If you want to implement a full service (pipeline executor, a delivery destination) — comment on the relevant issue or open one and we will scope it together.

---

## Project Structure

```
flowmesh/
├── apps/
│   ├── ingestion/          ← Start here. Most complete NestJS service.
│   ├── config-service/     ← Pipeline definitions, encrypted destination credentials
│   ├── pipeline/           ← Filter / transform / enrich / fan-out executor
│   ├── delivery/           ← Go: consume queue, deliver to destinations
│   ├── auth/               ← JWT, API keys, RBAC
│   ├── analytics/          ← Metrics aggregation
│   ├── alert/              ← Alert rule evaluation
│   ├── api-gateway/        ← Edge: rate limiting, routing
│   └── dashboard/          ← React frontend
├── packages/
│   ├── nestjs-common/      ← Shared NestJS infrastructure (health, exception filter, correlation ID)
│   ├── shared-types/       ← TypeScript types shared across all services
│   ├── sdk-node/           ← Node.js client SDK
│   └── ui-components/      ← Shared React components
├── docker/                 ← Docker Compose, Dockerfiles, init scripts
└── docs/
    └── adr/                ← Architecture Decision Records — read these before proposing changes
```

Read the ADRs before proposing architectural changes. They document why specific decisions were made (RabbitMQ over Kafka, two Redis instances, Go for delivery, Prisma over TypeORM, schema-per-service isolation, etc.).

---

## Code Standards

### TypeScript (all NestJS services)

- Strict mode enforced — `strict: true` in every service tsconfig, no `any`
- All function parameters and return types must be explicitly typed
- `const` by default; `let` only when mutation is required
- `unknown` over `any` — narrow the type before using it
- No commented-out code committed to the repo
- No `console.log` — use the injected `PinoLogger` or the NestJS `Logger`

### Shared NestJS infrastructure

Every NestJS service imports its common infrastructure from `@flowmesh/nestjs-common`. **Never copy these files into a service:**

- `HttpExceptionFilter` — global exception handler, consistent error envelope
- `CorrelationIdMiddleware` — reads/generates `x-correlation-id` on every request
- `HealthModule` / `HealthController` — `GET /health` returning `{ status: 'ok' }`

```ts
// Correct
import { HttpExceptionFilter, HealthModule, CorrelationIdMiddleware } from '@flowmesh/nestjs-common'

// Wrong — never copy these files locally
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
```

If you change `nestjs-common`, rebuild it before starting a service:
```bash
pnpm --filter @flowmesh/nestjs-common build
```

### NestJS patterns

- One module per domain concern
- Services hold business logic; controllers hold only HTTP handling and input mapping
- Use Prisma for all database access — no raw SQL unless a Prisma limitation forces it
- Parameterized queries only — never string concatenation for SQL
- Every new service needs `GET /health` returning `{ status: 'ok' }`
- All services bind to `0.0.0.0` — never `localhost` (breaks Docker networking)
- Port is always read from `ConfigService`, never `process.env.PORT` directly in `main.ts`

### Go (delivery service)

- Format with `gofmt` before committing
- Follow standard Go naming conventions — exported names are PascalCase, unexported are camelCase
- Wrap errors with context: `fmt.Errorf("delivering to slack: %w", err)`
- Handle errors explicitly — never `_` discard an error from a meaningful operation
- Use goroutines for concurrent destination delivery — never sequential blocking calls

### Database migrations (Prisma)

**Never run `prisma migrate dev` without `--create-only`.** It auto-applies without review.

The correct workflow:
```bash
# 1. Generate the SQL file without running it
pnpm --filter @flowmesh/<service> prisma:migrate:create

# 2. Review the generated .sql file — check for unexpected drops or data-loss operations

# 3. Apply reviewed migrations
make <service>-migrate
```

Migrations are append-only — never edit a migration file after it has been applied anywhere.

### Testing

- Unit tests colocated with source: `src/module/module.service.spec.ts`
- Integration tests: `src/module/module.integration.spec.ts`
- **Coverage threshold: 80% minimum on statements, branches, and functions.** CI blocks the PR if any metric falls below this. Check before pushing: `make test-coverage`
- Do not mock the database or RabbitMQ in integration tests — use real infrastructure via test containers
- Never share state between tests — each test sets up and tears down its own data

Excluded from coverage (do not add `.spec.ts` files for these):
- `src/main.ts`
- `**/*.module.ts`
- `**/migrations/**`
- `**/generated/**` (Prisma generated client)

---

## Submitting a Pull Request

1. Fork the repo and create a branch off `main`:
   - `feat/your-feature-name`
   - `fix/what-you-are-fixing`

2. Make your changes following the standards above.

3. Run tests — both must pass:
   ```bash
   make test
   make test-integration   # if you changed a service
   ```

4. Commit using [Conventional Commits](https://www.conventionalcommits.org/). **Scope is required and enforced by a pre-commit hook:**

   ```
   feat(ingestion): add retry header on 429 responses
   fix(pipeline): handle missing transform config gracefully
   test(config): add unit tests for pipeline validator
   docs(docs): add readme for ingestion service
   ```

   Valid scopes: `ingestion`, `pipeline`, `delivery`, `auth`, `analytics`, `alert`, `config`, `gateway`, `shared-common`, `shared-types`, `docker`, `makefile`, `prisma`, `ci`, `deps`, `docs`

   Subject must be lowercase. Header max length is 100 characters. The hook will reject commits that do not follow this format — this is intentional.

5. Open a PR against `main` with a description of what changed and why.

6. Link related issues: `Closes #123`

PRs are reviewed within a few days. For large changes, expect a discussion before approval.

---

## Architecture Decision Records

Every significant architectural decision is documented in `docs/adr/`. Read these before proposing changes to service boundaries, data flow, technology choices, or cross-service patterns.

If your contribution requires a new architectural decision, write a draft ADR and include it in your PR. ADRs are append-only — never rewrite a past one, write a new one that supersedes it.

---

## Questions?

Open a [GitHub Discussion](https://github.com/syedarifiqbal/flowmesh/discussions) for questions, ideas, and design conversations.

For bugs or concrete feature requests, open an [issue](https://github.com/syedarifiqbal/flowmesh/issues).

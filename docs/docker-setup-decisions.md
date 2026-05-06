# Docker Stack Setup — Changes and Tradeoffs

This document records every change made to get `make up` working end-to-end, the reason each change was required, and the tradeoffs accepted.

---

## 1. `package.json` — `prepare` script made fault-tolerant

**Change**
```diff
- "prepare": "husky"
+ "prepare": "husky || true"
```

**Why**
`pnpm install --prod` in the Docker production stage runs lifecycle scripts including `prepare`. Husky is a devDependency — it's absent in a `--prod` install. The script exited with code 1, killing the build.

**Tradeoff**
`|| true` masks any future failure in the `prepare` script. If husky itself breaks during local dev setup, the error is silently swallowed. Accepted because this is the standard pattern for husky in CI/Docker and the failure mode (git hooks not installing) is obvious during `git commit`.

---

## 2. `.npmrc` — NestJS packages hoisted to workspace root

**Change**
```diff
+ public-hoist-pattern[]=@nestjs/*
+ public-hoist-pattern[]=reflect-metadata
```

**Why**
pnpm isolates each package's `node_modules` by default. `packages/nestjs-common/dist/` is loaded at runtime by NestJS, which needs `@nestjs/common`, `@nestjs/core`, and `reflect-metadata` to be singleton instances shared across the entire module graph. Without hoisting, each service's isolated `node_modules` held its own copy; `nestjs-common` couldn't find its NestJS peers.

**Tradeoff**
Hoisting breaks pnpm's isolation model for these packages. Any package in the workspace can now accidentally import `@nestjs/common` without declaring it as a dependency and the build won't fail locally — the error would only surface in CI or a clean install. Accepted because NestJS requires singleton resolution by design; this is the documented solution for pnpm + NestJS monorepos.

---

## 3. `packages/nestjs-common/package.json` — `amqplib` moved from peer to direct dependency

**Change**
```diff
  "peerDependencies": {
-   "amqplib": "^0.10.3",
    "@nestjs/common": "^10.0.0",
    "express": "^4.18.0"
  },
+ "dependencies": {
+   "amqplib": "^0.10.3"
+ }
```

**Why**
`nestjs-common/dist/index.js` imports `amqplib` (for `RabbitMqConnection`) at module load time. Services like `auth` and `api-gateway` that don't use RabbitMQ directly never declared `amqplib` in their own `package.json` — so pnpm had nothing to install or hoist for them. The module resolution failed at runtime.

**Tradeoff**
Every consumer of `nestjs-common` now installs `amqplib` even if they never use RabbitMQ. This adds ~500 KB to the install for services that don't need it. The cleaner solution would be lazy loading or splitting `nestjs-common` into sub-packages (`nestjs-common/rabbitmq`, `nestjs-common/logging`). Accepted for now because the weight is negligible at dev scale; splitting the package is a future refactor if the package grows.

---

## 4. `docker/Dockerfile.nestjs` — OpenSSL installed in both stages

**Change**
```dockerfile
# Added to both `deps` and `production` stages:
RUN apk add --no-cache openssl
```

**Why**
The Prisma query engine is a native binary. Prisma detects the OpenSSL version at build time to pick the correct binary target. Without OpenSSL present during the `deps` stage, Prisma defaulted to `openssl-1.1.x` — which doesn't exist in Alpine 3.18+. At runtime (production stage), the binary also couldn't load without the library present.

**Tradeoff**
Adds a small layer to both stages (~4 MB). No meaningful downside — OpenSSL is a standard system library.

---

## 5. `docker/Dockerfile.nestjs` — `.npmrc` copied into both stages

**Change**
```dockerfile
# deps stage:
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json .npmrc ./

# production stage:
COPY --from=deps /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/.npmrc ./
```

**Why**
`.npmrc` contains the `public-hoist-pattern` directives (change #2). Without it in the Docker build context, `pnpm install` inside the container ran with default isolation settings — the hoisting rules were never applied, causing the `@nestjs/common` resolution failure.

**Tradeoff**
None. `.npmrc` contains no secrets, only workspace configuration.

---

## 6. `docker/docker-compose.yml` — JWT secrets removed from `environment:` blocks

**Change**
```diff
  auth:
    environment:
-     JWT_SECRET: ${JWT_SECRET}
-     JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      PORT: 3004
      ...

  api-gateway:
    environment:
-     JWT_SECRET: ${JWT_SECRET}
      PORT: 3000
      ...
```

**Why**
Docker Compose resolves `${VAR}` substitutions from the `.env` file in the **same directory as the compose file** (`docker/.env`), not from `env_file:`. The `docker/.env` only holds infrastructure passwords (`POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`). `${JWT_SECRET}` resolved to an empty string — which then **overrode** the correct value from `env_file: ../.env`, causing Joi validation to reject startup with `JWT_SECRET is not allowed to be empty`.

**Tradeoff**
JWT secrets are no longer visible as explicit keys in the compose file — they come in silently through `env_file`. This is slightly less discoverable for someone reading docker-compose.yml for the first time. Accepted because the `env_file` pattern is the standard way to inject secrets into Docker services; listing them explicitly in `environment:` with `${}` substitution is only correct when the variable source matches the compose file's directory.

---

## 7. `docker/docker-compose.yml` — `?schema=xxx` added to DATABASE_URL for each service

**Change**
```diff
  ingestion:
    environment:
-     DATABASE_URL: postgresql://flowmesh:${POSTGRES_PASSWORD}@pgbouncer:5432/flowmesh
+     DATABASE_URL: postgresql://flowmesh:${POSTGRES_PASSWORD}@pgbouncer:5432/flowmesh?schema=ingestion

  config-service:
    environment:
-     DATABASE_URL: postgresql://flowmesh:${POSTGRES_PASSWORD}@pgbouncer:5432/flowmesh
+     DATABASE_URL: postgresql://flowmesh:${POSTGRES_PASSWORD}@pgbouncer:5432/flowmesh?schema=config
```

**Why**
Each service's Joi config schema declared `DATABASE_URL` as a string matching `postgresql://...?schema=<name>` — the `?schema=` suffix was required. Without it the Joi validation at startup rejected the value.

Additionally, Prisma uses the `?schema=` parameter to set the PostgreSQL `search_path`, scoping all queries to the service's own schema and preventing cross-service table collisions.

**Tradeoff**
The `?schema=` parameter causes Prisma to send a `search_path` startup parameter to PostgreSQL on every new connection. PgBouncer in transaction mode rejects unrecognised startup parameters by default — this is what required the `IGNORE_STARTUP_PARAMETERS` change (see #8).

---

## 8. `docker/docker-compose.yml` — `IGNORE_STARTUP_PARAMETERS` added to PgBouncer

**Change**
```diff
  pgbouncer:
    environment:
+     IGNORE_STARTUP_PARAMETERS: extra_float_digits,search_path
```

**Why**
PgBouncer in transaction pooling mode proxies individual transactions, not connections. It cannot forward per-connection startup parameters (like `search_path`) to the server. When Prisma sends `search_path=ingestion` on connect, PgBouncer rejected it with `FATAL: unsupported startup parameter: search_path`.

`IGNORE_STARTUP_PARAMETERS` tells PgBouncer to silently drop those parameters instead of rejecting the connection. Prisma's `SET search_path` is then applied per-query by Prisma itself, so the schema scoping still works correctly.

**Tradeoff**
PgBouncer drops `search_path` and `extra_float_digits` silently. If a service relied on the connection-level `search_path` being set by the startup parameter (rather than by Prisma's own query), it would silently query the wrong schema. Prisma handles this correctly, so there is no practical risk. Any future raw-psql connection through PgBouncer would also have `search_path` ignored — a developer would need to set it explicitly per query.

---

## 9. `apps/ingestion/` — Custom Prisma output path added

**Change — `prisma/schema.prisma`**
```diff
  generator client {
    provider = "prisma-client-js"
+   output   = "../src/generated/prisma"
  }
```

**Change — `src/prisma/prisma.service.ts`**
```diff
- import { PrismaClient } from '@prisma/client'
+ import { PrismaClient } from '../generated/prisma'
```

**Change — `nest-cli.json`** (new file)
```json
{
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": [{ "include": "generated/**/*", "watchAssets": true }]
  }
}
```

**Why**
All other services (auth, pipeline, config-service) already used a custom output path. Ingestion was the only service still importing from `@prisma/client` (the default pnpm store location). In the Docker production stage, `pnpm install --prod` generates a stub Prisma client with no schema — the real generated client only exists after `prisma generate` is run against the actual schema. Importing from `@prisma/client` in production hit the stub and crashed with `@prisma/client did not initialize yet`.

The custom output path `../src/generated/prisma` places the generated client inside the service's own source tree. The `nest-cli.json` assets config then copies it into `dist/generated/prisma/` during `nest build`, making it available in the production stage without needing a `prisma generate` run at runtime.

**Tradeoff**
The generated Prisma client (hundreds of JS files) is now committed-adjacent — it lives in `src/generated/` which is gitignored, and gets copied to `dist/` on every build. This is the correct pattern but means the Docker builder stage must run `prisma generate` before `nest build`. The Dockerfile already handles this with the `prisma:generate` step.

---

## 10. `docker/docker-compose.yml` — PgBouncer `AUTH_TYPE` changed from `trust` to `plain`

**Change**
```diff
  pgbouncer:
    environment:
-     AUTH_TYPE: trust
+     AUTH_TYPE: plain
```

**Why**
`AUTH_TYPE` controls how PgBouncer stores passwords in `userlist.txt`, which in turn determines how it can authenticate to PostgreSQL as a backend client.

- `trust` → generates `"flowmesh" "md5<hash>"` in `userlist.txt`
- `plain` → generates `"flowmesh" "flowmesh_dev"` (plaintext) in `userlist.txt`

PostgreSQL 16 defaults to `password_encryption = scram-sha-256`. SCRAM is a challenge-response protocol — PgBouncer must know the **plaintext** password to compute the correct SCRAM response. An MD5 hash cannot be used to answer a SCRAM challenge.

With `AUTH_TYPE: trust`, PgBouncer stored an MD5 hash and then failed every backend login with `cannot do SCRAM authentication: wrong password type`.

With `AUTH_TYPE: plain`, PgBouncer stores the plaintext password and can complete the SCRAM handshake with PostgreSQL successfully.

**Tradeoff**
`AUTH_TYPE: plain` means PgBouncer requires clients (the NestJS services) to send their password in plaintext over the connection. In an external network this would be a security concern. On the internal Docker bridge network (`flowmesh` bridge), traffic does not leave the host and is not exposed to the internet, so plaintext auth between containers is acceptable.

The alternative — changing PostgreSQL's `password_encryption` to `md5` — would be a regression in security posture (MD5 is cryptographically broken for password hashing). It would also require re-creating the `flowmesh` user after modifying `postgresql.conf`, which means touching the already-initialised data volume.

A future hardening option: set `AUTH_TYPE: scram-sha-256` in PgBouncer (stores a SCRAM verifier in userlist.txt instead of plaintext). This requires computing and pre-inserting the SCRAM verifier rather than using the automatic env-var-based generation in the edoburu image. Worth revisiting when adding TLS to the internal network.

---

## Summary

| # | File | Change | Tradeoff severity |
|---|---|---|---|
| 1 | `package.json` | `husky \|\| true` | Low |
| 2 | `.npmrc` | Hoist `@nestjs/*` and `reflect-metadata` | Medium — weakens pnpm isolation for NestJS packages |
| 3 | `nestjs-common/package.json` | `amqplib` as direct dep | Low |
| 4 | `Dockerfile.nestjs` | Install OpenSSL in both stages | None |
| 5 | `Dockerfile.nestjs` | Copy `.npmrc` into build | None |
| 6 | `docker-compose.yml` | Remove JWT vars from `environment:` | Low — less discoverable |
| 7 | `docker-compose.yml` | Add `?schema=` to DATABASE_URL | Low — required `IGNORE_STARTUP_PARAMETERS` |
| 8 | `docker-compose.yml` | `IGNORE_STARTUP_PARAMETERS` in PgBouncer | Low — `search_path` silently dropped |
| 9 | `apps/ingestion/` | Custom Prisma output path | None |
| 10 | `docker-compose.yml` | PgBouncer `AUTH_TYPE: plain` | Medium — plaintext auth on internal network |

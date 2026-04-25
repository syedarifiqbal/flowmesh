# ADR-006: Turborepo + pnpm Monorepo

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

FlowMesh has 8+ backend services (NestJS), 2 frontend apps (React, Next.js), and 3 shared packages (shared-types, sdk-node, ui-components). These all need to share TypeScript type definitions, use consistent tooling, and be buildable/testable independently or together. The question is whether to use a monorepo and, if so, which tooling.

## Decision

Use a monorepo with Turborepo as the task orchestrator and pnpm as the package manager.

Structure:
```
flowmesh/
  apps/        — all services and frontend apps
  packages/    — shared-types, sdk-node, ui-components
  turbo.json   — task pipeline definitions
  pnpm-workspace.yaml
```

## Consequences

### Positive
- `@flowmesh/shared-types` is a real package importable by all services — no copy-pasting types or syncing interfaces across repos
- Turborepo's task pipeline (`build`, `dev`, `test`, `lint`, `typecheck`) runs tasks in dependency order and caches results — `build` in `shared-types` always runs before services that depend on it
- pnpm's workspace protocol and hard-linking reduce `node_modules` disk usage significantly in a repo with many packages
- A single `pnpm install` at the root installs all dependencies for all services
- TypeScript project references via `tsconfig.base.json` give compile-time type safety across package boundaries

### Negative
- Developers new to monorepos may find workspace dependency resolution non-obvious
- Turborepo's remote caching (for CI speed) requires a Turborepo account or self-hosted cache — not configured yet
- Go cannot participate in the pnpm workspace — the Delivery service is managed separately with `go mod`

### Neutral
- The Go Delivery service lives at `apps/delivery/` but uses its own `go.mod` — it participates in the Turborepo pipeline only for `dev` and `build` tasks via custom scripts
- Each service has its own `package.json` with local scripts; Turborepo orchestrates the cross-service execution order

## Alternatives Considered

### Polyrepo (separate repo per service)
Maximum independence per service, but sharing types becomes painful — either a published npm package (requires a release process) or copy-pasting. Type drift across services becomes a real problem. CI/CD complexity multiplies.

### Nx
More powerful than Turborepo (code generation, affected-file detection, plugin ecosystem) but significantly more complex to configure and maintain. Turborepo does exactly what FlowMesh needs with minimal configuration overhead.

### Lerna
Lerna was the original monorepo tool for JavaScript but has been largely superseded by Turborepo and Nx for build orchestration. pnpm workspaces handle the package linking that Lerna used to manage.

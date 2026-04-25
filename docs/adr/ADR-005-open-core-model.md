# ADR-005: Open Core Business Model (Community + Cloud)

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

FlowMesh needs a business model that allows it to be genuinely open source (for community trust and GitHub distribution) while providing a path to revenue (for sustainability and acquisition value). Several models exist: fully open source with support contracts, open source with a proprietary enterprise license, open core (open source core + proprietary cloud features), or source-available with a commercial license.

## Decision

Adopt the open core model:

- **Community Edition** (`flowmesh` public repo): fully open source, Apache 2.0, no feature flags, no artificial limits, self-hosted forever free
- **FlowMesh Cloud** (`flowmesh-cloud` private repo): managed cloud service with enterprise-only features — multi-tenancy, SSO/SAML, audit logs, billing. These features never appear in the public repo.

The line between community and cloud: if a self-hosted community user needs it to run FlowMesh in production, it belongs in the public repo. If it only exists to support the managed cloud service, it belongs in the private repo.

## Consequences

### Positive
- Community edition builds genuine trust — no bait-and-switch, no feature flags, no license checks. Contributors and users know exactly what they're getting.
- Open source distribution creates an organic growth channel (GitHub stars, HN, Reddit) that paid distribution cannot replicate
- Cloud edition provides revenue without cannibalizing the open source community
- Clean repo boundary is defensible to contributors, acquirers, and the press
- Acquisition value comes from two sources: community distribution moat (open source) and MRR (cloud)
- Proven model: GitLab, Grafana, Metabase, Mattermost all use this structure

### Negative
- Requires maintaining two codebases — the cloud repo imports community packages and extends them
- The community/cloud feature split decision must be made for every new feature — requires discipline
- A Contributor License Agreement (CLA) is required before accepting community PRs, to preserve the right to offer a commercial cloud service

### Neutral
- No enterprise license keys or feature flags in the open source code — the codebase is simpler for it
- Enterprise features (SSO, RBAC, audit logs) are genuinely only useful in a multi-tenant managed context — the split is natural, not forced

## Alternatives Considered

### Fully open source (AGPL or MIT)
No sustainable revenue path without support contracts, which require sales infrastructure. AGPL discourages enterprise adoption. MIT with sponsorships is unpredictable income.

### Source-available (BSL or Commons Clause)
Damages community trust — contributors hesitate to invest in a codebase with a commercial restriction. GitHub stars and organic growth are harder to achieve. OSI does not consider these licenses "open source."

### Dual license (GPL + commercial)
Works for libraries but creates friction for application-level software. Self-hosters would need to buy a commercial license to use FlowMesh in a closed-source product — too high a barrier for the target audience.

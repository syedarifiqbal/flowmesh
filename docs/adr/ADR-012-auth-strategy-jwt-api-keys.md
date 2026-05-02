# ADR-012 — Authentication Strategy: JWT + API Keys

## Status
Accepted

## Context

FlowMesh has two classes of callers:

1. **Human users** — access the dashboard, configure pipelines and destinations, manage their workspace via a browser. They need session-like authentication: login with email + password, stay authenticated for a reasonable period, be able to log out.

2. **SDK / server-side callers** — send events from their application code to the ingestion endpoint. They need a long-lived, non-expiring credential that is easy to include in an HTTP header. Rotating a credential must not require redeployment.

A single auth mechanism does not serve both use cases well. A JWT alone is too short-lived for SDK callers. A static API key alone has no revocation mechanism that works with short-lived dashboard sessions.

## Decision

Use **two authentication mechanisms** in the same auth service:

### 1. JWT (for human dashboard users)
- **Access token**: short-lived (15 minutes), signed with `JWT_SECRET`, payload `{ sub: userId, workspaceId, type: "access" }`
- **Refresh token**: long-lived (7 days), signed with `JWT_REFRESH_SECRET`, payload `{ sub: userId, jti: tokenId, type: "refresh" }`. Stored as a SHA-256 hash in Postgres, enabling rotation and revocation.
- **Token rotation**: every refresh call issues a new access + refresh token pair. The old refresh token is immediately revoked (hash deleted from Postgres, hash added to Redis 2 blacklist with TTL = remaining expiry).
- **Logout**: adds the refresh token `jti` to Redis 2 blacklist with TTL equal to remaining token lifetime.

### 2. API Keys (for SDK / server-side callers)
- Format: `fm_<64 hex chars>` (3-byte prefix + 32 random bytes encoded as hex)
- Storage: SHA-256 hash of the full key stored in Postgres. Plaintext returned once on creation, never stored.
- Display: first 11 characters shown in the UI (`fm_a3b9c1...`) so the user can identify which key is which.
- Revocation: `revokedAt` timestamp set in Postgres; SHA-256 hash added to Redis 2 blacklist immediately with no TTL (revoked forever, until key record is cleaned up).
- Validation at gateway: hash the incoming key, check Redis 2 blacklist first (fast path), then check Postgres `revokedAt` if not in blacklist.

### Token blacklist in Redis 2
- Key pattern for JWT: `auth:blacklist:{jti}`
- Key pattern for API key: `auth:blacklist:apikey:{keyHash}`
- Both stored in Redis 2 (persistent AOF) — survives restarts, so a revoked token can never be reused even after a Redis restart.

## Consequences

**Good:**
- Short-lived access tokens limit the blast radius of a stolen token — it expires in 15 minutes without any action
- Refresh token rotation means a stolen refresh token can be detected (the legitimate user's next refresh will fail because the token was already used by the attacker)
- API key revocation is instant via Redis 2 blacklist — no waiting for a token to expire
- SHA-256 hashing of API keys means a database breach does not expose usable credentials
- Both mechanisms are validated at the gateway — individual backend services do not implement auth logic

**Trade-offs:**
- Two-token pattern requires the dashboard client to implement refresh logic (handle 401, call /auth/refresh, retry)
- Redis 2 is a hard dependency for revocation — if Redis 2 is unavailable, the gateway cannot validate revocations (fail-open risk). This is acceptable for community edition; enterprise edition should add a secondary validation path.
- Refresh token rotation means users are implicitly logged out if the same refresh token is used twice (possible if the client retries on network error). The client must handle this gracefully by redirecting to login.

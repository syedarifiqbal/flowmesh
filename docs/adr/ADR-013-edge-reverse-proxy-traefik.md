# ADR-013: Traefik as Edge Reverse Proxy over Nginx/OpenResty

**Date:** 2026-05-02
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

FlowMesh needs an edge reverse proxy that sits in front of the API Gateway to handle:

- TLS termination (HTTPS on port 443, HTTP redirect on port 80)
- Automatic SSL certificate provisioning and renewal
- WebSocket proxying with sticky sessions (required by the Phase 2 live dashboard)
- Load balancing across API Gateway replicas when horizontally scaled

The proxy must work with FlowMesh's Docker Compose self-hosted deployment model. The target user runs `docker-compose up` on a single VPS and expects a production-ready HTTPS endpoint without manual certificate management.

The two main candidates evaluated were Traefik and Nginx (including OpenResty, the Lua-extended variant).

## Decision

Use **Traefik v3** as the edge reverse proxy for FlowMesh's Docker Compose deployment.

## Architecture

```
Internet :443 / :80
       ↓
    Traefik          ← TLS termination, WebSocket sticky sessions, load balancing
       ↓
  API Gateway :3000  ← auth, rate limiting, routing (internal network only)
       ↓
  Ingestion / Config / Auth / Pipeline / Delivery (internal network only)
```

No downstream service is exposed on a public port. Only Traefik binds to 80 and 443 on the host.

## Consequences

### Positive
- **Zero-config SSL** — Traefik integrates with Let's Encrypt via `certificatesresolvers`. A single label on the API Gateway container (`traefik.http.routers.gateway.tls.certresolver=letsencrypt`) provisions and auto-renews the certificate with no certbot cron job or manual renewal
- **Docker-native configuration** — routing rules live as Docker labels on each service container. No separate Traefik config file needs to be updated when a service is added or its port changes
- **WebSocket support** — Traefik proxies WebSocket connections transparently and supports sticky sessions via cookie-based load balancing, which is required for the Phase 2 dashboard's Redis pub/sub WebSocket feed
- **Dynamic reconfiguration** — Traefik watches the Docker socket and reconfigures itself when containers start or stop, without a reload or restart
- **Dashboard and metrics** — Traefik's built-in dashboard gives operators visibility into routes, middleware, and upstream health without extra tooling
- **Middleware composability** — Traefik's middleware chain (IP allowlist, headers, redirect) is declared in labels, keeping routing logic co-located with the service definition

### Negative
- **Docker socket exposure** — Traefik reads the Docker socket to discover containers. The socket must be mounted read-only (`/var/run/docker.sock:/var/run/docker.sock:ro`) and Traefik should run with a restricted user. Mounting the socket always carries a privilege escalation risk if the container is compromised
- **Less flexibility at the edge** — Nginx/OpenResty supports Lua scripting for custom logic (advanced rate limiting, request signing, geo-blocking) directly at the proxy layer. Traefik's middleware is more opinionated and does not support arbitrary scripting. For FlowMesh's use case this is not needed — all custom logic lives in the API Gateway
- **Learning curve for complex routing** — Traefik's label-based DSL is more verbose than Nginx's declarative config for advanced routing scenarios (e.g., path rewriting, complex header manipulation). For FlowMesh's simple "proxy all traffic to API Gateway" topology this is not a problem

### Neutral
- Both Traefik and Nginx support HTTP/2 and gzip compression
- Both are production-battle-tested at scale
- Traefik is written in Go; Nginx is written in C — neither has meaningful performance differences for FlowMesh's traffic profile

## Alternatives Considered

### Nginx (standard)
Nginx is the most widely deployed reverse proxy. It is extremely stable, has excellent documentation, and its config syntax is well understood. However, SSL certificate management requires a separate certbot container and a cron job for renewal. Adding a new service requires editing `nginx.conf` and sending a `SIGHUP` reload signal. For the FlowMesh self-hosted use case, this is unnecessary operational burden — the user should not need to know Nginx configuration to run FlowMesh.

### OpenResty (Nginx + LuaJIT)
OpenResty adds Lua scripting to Nginx, enabling custom logic at the proxy layer. This is valuable for high-performance edge use cases (Cloudflare, Kong API Gateway) where request processing must happen at the proxy without a hop to an application server. FlowMesh already has an API Gateway service that handles auth, rate limiting, and routing. Duplicating or splitting this logic at the Nginx layer would create two places to maintain the same rules and introduce subtle inconsistencies. OpenResty's power is not needed here.

### Caddy
Caddy has automatic HTTPS similar to Traefik and a clean JSON/Caddyfile config format. It is a valid alternative. Traefik is preferred because its Docker provider is more mature and widely used in the self-hosted open-source community, and its label-based configuration aligns better with the Docker Compose deployment model FlowMesh targets.

### No edge proxy (API Gateway on port 443 directly)
Terminating TLS inside the NestJS API Gateway using `@nestjs/core` and Node's `https` module is possible but inadvisable. Node is not optimised for TLS termination at scale, certificate renewal becomes an application concern, and the Gateway process would need to run as root or use `setcap` to bind to port 443. Keeping TLS at the infrastructure layer is the correct separation of concerns.

## Implementation Notes

Traefik will be added to `docker/docker-compose.yml` during Phase 5 (deployment polish) alongside Dockerfiles for each service. The API Gateway container will gain the following labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.gateway.rule=Host(`your-domain.com`)"
  - "traefik.http.routers.gateway.entrypoints=websecure"
  - "traefik.http.routers.gateway.tls.certresolver=letsencrypt"
  - "traefik.http.services.gateway.loadbalancer.server.port=3000"
  - "traefik.http.services.gateway.loadbalancer.sticky.cookie=true"
```

The `sticky.cookie=true` setting ensures WebSocket connections in the Phase 2 dashboard are routed to the same Gateway replica for the lifetime of the connection.

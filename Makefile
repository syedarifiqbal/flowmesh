DOCKER_DIR  := docker
COMPOSE     := docker-compose -f $(DOCKER_DIR)/docker-compose.yml

# ─── Infrastructure ──────────────────────────────────────────────────────────

infra-up:
	$(COMPOSE) up postgres redis-ephemeral redis-persistent rabbitmq loki promtail grafana -d

infra-down:
	$(COMPOSE) down

infra-logs:
	$(COMPOSE) logs -f postgres redis-ephemeral redis-persistent rabbitmq

infra-psql:
	docker exec -it flowmesh-postgres psql -U flowmesh -d flowmesh

# ─── Observability ───────────────────────────────────────────────────────────

obs-up:
	$(COMPOSE) up loki promtail grafana -d

obs-down:
	$(COMPOSE) stop loki promtail grafana

obs-logs:
	$(COMPOSE) logs -f loki promtail grafana

grafana-open:
	open http://localhost:3200

# ─── Full stack ───────────────────────────────────────────────────────────────

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

down-v:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f

# ─── Restart individual service containers (rebuilds image) ──────────────────

restart-gateway:
	$(COMPOSE) up -d --build api-gateway

restart-ingestion:
	$(COMPOSE) up -d --build ingestion

restart-pipeline:
	$(COMPOSE) up -d --build pipeline

restart-delivery:
	$(COMPOSE) up -d --build delivery

restart-auth:
	$(COMPOSE) up -d --build auth

restart-config:
	$(COMPOSE) up -d --build config-service

restart-analytics:
	$(COMPOSE) up -d --build analytics

restart-dashboard:
	$(COMPOSE) up -d --build dashboard

# ─── Ingestion service ────────────────────────────────────────────────────────

ingestion-dev:
	pnpm --filter @flowmesh/ingestion dev

ingestion-migrate-create:
	pnpm --filter @flowmesh/ingestion prisma:migrate:create

ingestion-migrate:
	pnpm --filter @flowmesh/ingestion prisma:migrate:deploy
	pnpm --filter @flowmesh/ingestion prisma:generate

ingestion-generate:
	pnpm --filter @flowmesh/ingestion prisma:generate

# ─── Pipeline service ────────────────────────────────────────────────────────

pipeline-dev:
	pnpm --filter @flowmesh/pipeline prisma:generate
	pnpm --filter @flowmesh/pipeline dev

pipeline-migrate-create:
	pnpm --filter @flowmesh/pipeline prisma:migrate:create

pipeline-migrate:
	pnpm --filter @flowmesh/pipeline prisma:migrate:deploy
	pnpm --filter @flowmesh/pipeline prisma:generate

pipeline-generate:
	pnpm --filter @flowmesh/pipeline prisma:generate

# ─── Delivery service (Go) ───────────────────────────────────────────────────

delivery-dev:
	cd apps/delivery && export $$(grep -v '^#' .env | xargs) && air -c .air.toml

delivery-build:
	cd apps/delivery && go build -o dist/delivery .

delivery-migrate:
	docker exec -i flowmesh-postgres psql -U flowmesh -d flowmesh < apps/delivery/migrations/001_create_dead_letter_events.sql
	docker exec -i flowmesh-postgres psql -U flowmesh -d flowmesh < apps/delivery/migrations/002_create_delivery_attempts.sql

delivery-test:
	cd apps/delivery && go test ./... -cover

delivery-test-race:
	cd apps/delivery && go test ./... -race -timeout 60s

# ─── Config service ──────────────────────────────────────────────────────────

config-dev:
	pnpm --filter @flowmesh/config-service prisma:generate
	pnpm --filter @flowmesh/config-service dev

config-migrate-create:
	pnpm --filter @flowmesh/config-service prisma:migrate:create

config-migrate:
	pnpm --filter @flowmesh/config-service prisma:migrate:deploy
	pnpm --filter @flowmesh/config-service prisma:generate

config-generate:
	pnpm --filter @flowmesh/config-service prisma:generate

gen-encryption-key:
	@echo "CONFIG_ENCRYPTION_KEY=$$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"

# ─── Auth service ────────────────────────────────────────────────────────────

auth-dev:
	pnpm --filter @flowmesh/auth prisma:generate
	pnpm --filter @flowmesh/auth dev

auth-migrate-create:
	pnpm --filter @flowmesh/auth prisma:migrate:create

auth-migrate:
	pnpm --filter @flowmesh/auth prisma:migrate:deploy
	pnpm --filter @flowmesh/auth prisma:generate

auth-generate:
	pnpm --filter @flowmesh/auth prisma:generate

# ─── API Gateway service ─────────────────────────────────────────────────────

gateway-dev:
	pnpm --filter @flowmesh/api-gateway dev

# ─── Analytics service ───────────────────────────────────────────────────────

analytics-dev:
	pnpm --filter @flowmesh/analytics dev

# ─── Dashboard ───────────────────────────────────────────────────────────────

dashboard-dev:
	pnpm --filter @flowmesh/dashboard dev

# ─── Testing ─────────────────────────────────────────────────────────────────

test:
	pnpm test

test-integration:
	pnpm vitest run --config vitest.integration.config.ts

test-coverage:
	pnpm test:coverage

test-watch:
	pnpm test:watch

# ─── Misc ────────────────────────────────────────────────────────────────────

install:
	pnpm install

gen-jwt-secret:
	@echo "JWT_SECRET=$$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
	@echo "JWT_REFRESH_SECRET=$$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"

env-setup:
	@for service in ingestion auth pipeline analytics alert config-service api-gateway; do \
		dir="apps/$$service"; \
		if [ -d "$$dir" ] && [ ! -f "$$dir/.env" ]; then \
			cp .env.example "$$dir/.env"; \
			echo "created $$dir/.env"; \
		elif [ -d "$$dir" ]; then \
			echo "skipped $$dir/.env (already exists)"; \
		fi; \
	done
	@if [ ! -f ".env" ]; then \
		printf "POSTGRES_PASSWORD=flowmesh_dev\nRABBITMQ_PASSWORD=flowmesh_dev\n" > .env; \
		echo "created .env (Docker infra passwords — fill in real values)"; \
	else \
		echo "skipped .env (already exists)"; \
	fi

.PHONY: infra-up infra-down infra-logs infra-psql obs-up obs-down obs-logs grafana-open up down down-v logs \
        ingestion-dev ingestion-migrate-create ingestion-migrate ingestion-generate \
        pipeline-dev pipeline-migrate-create pipeline-migrate pipeline-generate \
        delivery-dev delivery-build delivery-migrate delivery-test delivery-test-race \
        config-dev config-migrate-create config-migrate config-generate gen-encryption-key \
        auth-dev auth-migrate-create auth-migrate auth-generate \
        gateway-dev analytics-dev dashboard-dev \
        restart-gateway restart-ingestion restart-pipeline restart-delivery \
        restart-auth restart-config restart-analytics restart-dashboard \
        test test-integration test-coverage test-watch install gen-jwt-secret env-setup

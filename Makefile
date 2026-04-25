DOCKER_DIR  := docker
COMPOSE     := docker-compose -f $(DOCKER_DIR)/docker-compose.yml

# ─── Infrastructure ──────────────────────────────────────────────────────────

infra-up:
	$(COMPOSE) up postgres redis-ephemeral redis-persistent rabbitmq -d

infra-down:
	$(COMPOSE) down

infra-logs:
	$(COMPOSE) logs -f postgres redis-ephemeral redis-persistent rabbitmq

# ─── Full stack ───────────────────────────────────────────────────────────────

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

down-v:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f

# ─── Ingestion service ────────────────────────────────────────────────────────

ingestion-dev:
	pnpm --filter @flowmesh/ingestion dev

ingestion-migrate-create:
	pnpm --filter @flowmesh/ingestion prisma:migrate:create

ingestion-migrate:
	pnpm --filter @flowmesh/ingestion prisma:migrate:deploy

ingestion-generate:
	pnpm --filter @flowmesh/ingestion prisma:generate

# ─── Testing ─────────────────────────────────────────────────────────────────

test:
	pnpm test

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

.PHONY: infra-up infra-down infra-logs up down down-v logs \
        ingestion-dev ingestion-migrate-create ingestion-migrate ingestion-generate \
        test test-coverage test-watch install gen-jwt-secret env-setup

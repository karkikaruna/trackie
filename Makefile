# ShipTrack developer commands (Ubuntu/Linux). Run `make help`.
SHELL := /bin/bash
VENV := backend/.venv
PY := $(VENV)/bin/python
BIN := $(VENV)/bin

.DEFAULT_GOAL := help
.PHONY: help secret env install install-backend install-frontend db db-stop migrate seed \
        dev dev-backend dev-frontend test test-backend test-frontend lint lint-backend \
        lint-frontend format build up down

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'

secret: ## Print a random value suitable for SESSION_SECRET_KEY
	@python3 -c 'import secrets; print(secrets.token_urlsafe(48))'

env: ## Create .env from .env.example with a freshly generated secret (never overwrites)
	@if [ -f .env ]; then echo ".env already exists; leaving it alone."; else \
	  cp .env.example .env && \
	  sed -i "s|^SESSION_SECRET_KEY=.*|SESSION_SECRET_KEY=$$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')|" .env && \
	  echo "Created .env with a generated SESSION_SECRET_KEY."; fi

install: install-backend install-frontend ## Install backend + frontend dependencies

install-backend: ## Create the Python venv and install the backend (with dev tools)
	python3 -m venv $(VENV)
	$(BIN)/pip install --quiet --upgrade pip
	$(BIN)/pip install --quiet -e "backend[dev]"

install-frontend: ## Install frontend dependencies from the lockfile
	cd frontend && npm ci

db: ## Start PostgreSQL in Docker and make sure the test database exists
	docker compose up -d --wait db
	@docker compose exec -T db psql -U shiptrack -d shiptrack -tAc "SELECT 1 FROM pg_database WHERE datname='shiptrack_test'" | grep -q 1 \
	  || docker compose exec -T db createdb -U shiptrack -O shiptrack shiptrack_test

db-stop: ## Stop the Docker database (data is kept)
	docker compose stop db

migrate: ## Apply database migrations to the development database
	cd backend && .venv/bin/alembic upgrade head

seed: ## Load demo data (demo@shiptrack.dev / Demo1234pass)
	cd backend && .venv/bin/python -m app.scripts.seed

dev-backend: ## Run the API with auto-reload on :8000
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

dev-frontend: ## Run the Vite dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

dev: db migrate ## Start DB, apply migrations, then run backend + frontend together
	$(MAKE) -j2 dev-backend dev-frontend

test: test-backend test-frontend ## Run all automated tests

test-backend: ## Backend tests (needs the database from `make db`; uses shiptrack_test)
	cd backend && .venv/bin/pytest

test-frontend: ## Frontend tests
	cd frontend && npm test

lint: lint-backend lint-frontend ## Lint + type-check everything

lint-backend:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .

lint-frontend:
	cd frontend && npm run lint && npm run typecheck

format: ## Auto-format and auto-fix the backend
	cd backend && .venv/bin/ruff check --fix . && .venv/bin/ruff format .

build: ## Production build of the frontend
	cd frontend && npm run build

up: ## Run the whole stack in Docker on http://localhost:8080
	@test -f .env || $(MAKE) env
	docker compose up --build

down: ## Stop the Docker stack
	docker compose down

# Trackie

**An AI-assisted issue tracker and project manager.** Teams organize projects, track bugs and tasks, and turn messy
bug reports into structured tickets with an optional AI assistant.

> **Stack:** React · TypeScript · Vite · Tailwind · TanStack Query · React Hook Form · Zod — FastAPI · SQLAlchemy 2 ·
> Alembic · PostgreSQL · Pytest · Docker · GitHub Actions

## Problem statement

Bug reports arrive scattered and unstructured, priorities are inconsistent, and heavyweight tools are overkill for small
teams. ShipTrack keeps projects and issues in one simple place, and its AI assistant reduces the work of turning an
informal report into a useful ticket, **without ever saving anything the user hasn't reviewed**.

## Features

* **Auth**: register / log in / log out, profile & password change. Server-side sessions in HTTP-only cookies, CSRF protection, Argon2id, rate limiting.
* **Projects**: create, edit, archive, delete; owner/member roles; add members by email.
* **Issues**: types (Bug/Task/Feature), statuses with validated transitions, priorities, assignees, human-readable keys (`SHIP-12`).
* **Search, filter, sort, paginate**: all done in the database; filters are kept in the URL.
* **Dashboard**: real counts, status chart, assigned-to-me, recently updated, recent activity, with empty states.
* **Activity history** on every issue (created, status/priority/assignee changes, edits).
* **AI bug-report assistant**: paste a rough report, get an editable draft (title, description, steps, expected/actual behavior, *suggested* priority, missing info). Works offline with a built-in mock provider; plug in Anthropic or any OpenAI-compatible API. Manual creation always works.

## Screenshots

> **Not included yet.** Screenshots can't be captured automatically in the environment this project was generated in.
> After running the app (`make dev`, then `make seed`), capture the dashboard, issue list, issue details and AI assistant
> into `docs/screenshots/` and link them here:
>
> `![Dashboard](docs/screenshots/dashboard.png)`

## Quick start (Ubuntu / Linux)

Prerequisites: Python 3.12+, Node.js 22+, Docker (with the Compose plugin), `make`.

```bash
# 1. Clone
git clone <your-repo-url> shiptrack && cd shiptrack

# 2-3. Create .env (generates a random SESSION_SECRET_KEY for you) and review it
make env

# 4. Start PostgreSQL in Docker (also creates the separate test database)
make db

# 5. Install dependencies (Python venv in backend/.venv, npm ci for the frontend)
make install

# 6. Create the tables
make migrate

# (optional) load demo data: demo@shiptrack.dev / Demo1234pass
make seed

# 7-8. Run backend (:8000) and frontend (:5173) together
make dev
```

Open <http://localhost:5173>. API docs (Swagger UI): <http://localhost:8000/docs>.

Prefer everything in containers? `make up` (or `docker compose up --build`) serves the app at <http://localhost:8080>.

Installing the tools on a fresh Ubuntu:
```bash
sudo apt update && sudo apt install -y python3 python3-venv make docker.io docker-compose-v2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo usermod -aG docker $USER   # log out/in afterwards
```

### Commands

| Command | What it does |
|---|---|
| `make env` / `make secret` | create `.env` with a generated secret / print a random secret |
| `make db` / `make db-stop` | start / stop PostgreSQL (Docker) |
| `make install` | install backend and frontend dependencies |
| `make migrate` / `make seed` | apply migrations / load demo data |
| `make dev` | DB + migrations + backend + frontend |
| `make test` | backend + frontend tests (`test-backend`, `test-frontend`) |
| `make lint` / `make format` | Ruff + ESLint + type-check / auto-format the backend |
| `make build` | production frontend build |

## Testing

```bash
make db            # tests use the separate `shiptrack_test` database
make test
```

* **Backend (Pytest, 109 tests)**: unit tests (validation, issue keys, status transitions, password/CSRF helpers, settings, AI schema) and
  integration tests against real PostgreSQL (auth, projects & membership, issues, filtering/sorting/pagination, dashboard,
  cross-project access, invalid assignments, deletion, DB constraints, AI endpoint + failure modes).
  The suite applies the Alembic migrations to an empty database first. It refuses to run against any database whose name doesn't end in `_test`.
  The AI provider is mocked: **no paid API calls**.
* **Frontend (Vitest + Testing Library, 45 tests)**: schemas, API client, login/registration, issue creation, filtering/pagination,
  loading/error/empty states, dashboard, the AI assistant flow (including failure fallback).
* **End-to-end (Playwright)**: *not implemented.* It was listed as "if time permits". A good first spec is register → create
  project → create issue → change status → dashboard reflects it.

## Configuration

All settings are environment variables (see [`.env.example`](.env.example)); the backend validates them at startup and refuses
to boot with missing/insecure production values.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | **required**. `postgresql+psycopg://user:pass@host:5432/db` |
| `SESSION_SECRET_KEY` | **required**. ≥32 random chars in production (`make secret`) |
| `APP_ENV` | `development` / `test` / `production` (production forces Secure cookies + strict secret checks) |
| `FRONTEND_URL`, `EXTRA_CORS_ORIGINS` | CORS allow-list (only needed if frontend and API are on different origins) |
| `COOKIE_SAMESITE`, `COOKIE_SECURE` | defaults `lax` / secure in production |
| `AI_PROVIDER` | `mock` (default) · `anthropic` · `openai` |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | required for real providers; `AI_BASE_URL` optional |
| `AI_TIMEOUT_SECONDS`, `AI_MAX_INPUT_CHARS` | provider timeout (20s) and input cap (5000) |
| `RATE_LIMIT_ENABLED`, `TRUST_PROXY_HEADERS` | the latter only behind a proxy you control |

### Using a real AI provider

```env
AI_PROVIDER=anthropic          # or: openai
AI_API_KEY=<your key>
AI_MODEL=<model id from your provider's docs>
```
Restart the backend. The key is only ever read by the backend. The assistant falls back to a clear error + manual form if the provider fails.
These provider adapters are covered by unit tests with mocked HTTP; **they have not been exercised against the live APIs** in this repository's
verification (no keys were available), so do a smoke test with your key.

## API overview

Interactive docs at `/docs` (OpenAPI JSON at `/api/v1/openapi.json`). All routes are under `/api/v1`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET/PATCH /auth/me` |
| Projects | `GET/POST /projects` · `GET/PATCH/DELETE /projects/{id}` |
| Members | `GET/POST /projects/{id}/members` · `DELETE /projects/{id}/members/{user_id}` |
| Issues | `GET/POST /issues` · `GET/PATCH/DELETE /issues/{id}` · `GET /issues/{id}/activities` |
| AI | `POST /ai/structure-bug-report` (returns a draft only) |
| Dashboard | `GET /dashboard` *(added beyond the brief: the dashboard needs real aggregated data)* |
| Health | `GET /health` · `GET /health/ready` (checks the DB) |

Issue list query parameters: `status`, `priority`, `issue_type`, `project_id`, `assignee` (`me` / `unassigned` / user id), `q`,
`sort` (`created_at|updated_at|priority`), `order`, `page`, `page_size` (≤100). Response: `{items, total, page, page_size, pages}`.

```
GET /api/v1/issues?status=OPEN&priority=HIGH&page=1&page_size=20
```

Errors always look like `{"error": {"code", "message", "details"}}`.

## Architecture & design

* [docs/architecture.md](docs/architecture.md): layering, auth/session/CSRF design, authorization matrix, AI design.
* [docs/database-design.md](docs/database-design.md): ER diagram, constraints, indexes, delete behavior.

Highlights: services own the business rules; every issue query is membership-scoped; issue numbers are allocated under a row
lock; status transitions are validated server-side; the AI never writes to the database.

## Security considerations

Argon2id hashing · HTTP-only, SameSite cookies (Secure in prod) · server-side sessions revoked on logout/password change ·
CSRF token on all writes · generic login errors + constant-time-ish unknown-user path · rate limits (login, register, AI) ·
authorization on every route (non-members get 404) · parameterized queries via SQLAlchemy, LIKE wildcards escaped · strict Pydantic
validation with `extra="forbid"` · body-size limit · security headers + CSP (nginx) · CORS allow-list · secrets only in env,
validated at startup · no stack traces or password hashes in responses · API keys never leave the backend · AI report text isn't logged.

## Deployment

The frontend and API are designed to be served **from one origin** (nginx or a platform rewrite proxies `/api` to the backend), which
avoids CORS and third-party-cookie problems.

* **Docker anywhere:** `docker compose up --build`. For a real server, put it behind HTTPS and set `APP_ENV=production`, a strong
  `SESSION_SECRET_KEY`, and `TRUST_PROXY_HEADERS=true`.
* **Split hosting (e.g. Vercel + a Python host + managed Postgres):** deploy `backend/` using its Dockerfile (it runs migrations on start), set the
  env vars above plus `DATABASE_URL`, and on Vercel add a rewrite of `/api/:path*` to your backend URL so the browser stays same-origin.
  If you instead call the API cross-site, set `VITE_API_URL`, `EXTRA_CORS_ORIGINS`, `COOKIE_SAMESITE=none` (requires HTTPS) and be aware that
  browsers increasingly block third-party cookies, so the rewrite approach is preferred.

**This repository has not been deployed** as part of its generation, so there is no live demo link yet. Add yours here after deploying
and verifying the workflows.

## Known limitations

* No deployed demo, screenshots, or Playwright e2e test yet (see above).
* **Docker files and `make db` / `make up` were not run** in the environment that generated this project (no Docker available there). The same
  backend/frontend code was verified against a locally installed PostgreSQL 16; please run `make up` once and report anything off.
* Rate limiting is in-memory (per process). Use Redis or a gateway for multi-instance deployments.
* Request-size limit relies on `Content-Length`; put a proxy limit (nginx `client_max_body_size`) in front for chunked uploads.
* Registration reveals whether an email is taken (standard trade-off for usable sign-up); login does not.
* Members must already be registered users (no email invitations). Search is `ILIKE`, not full-text.
* Issue descriptions are plain text (no markdown rendering). No comments, attachments, or notifications.

## Future improvements (P2)

Email invitations & notifications · comments · file attachments · real-time updates (WebSocket/SSE) · markdown descriptions ·
full-text search (`pg_trgm`) · custom workflows · GitHub integration · audit logs · Redis-backed rate limiting · Playwright e2e in CI.


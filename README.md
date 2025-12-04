# Code Execution Platform

Lightweight platform where users author coding challenges, write solutions, and run them against curated test cases before submitting for review. Reviewers can inspect runs, tweak hidden cases, and approve/reject entries.

## Live Demo

| Surface  | URL                                                                 |
|----------|---------------------------------------------------------------------|
| Frontend | https://inspiring-griffin-dc6e8c.netlify.app                        |
| Backend  | https://aq-swe-take-backend.onrender.com (health at `/health`)      |

Reviewer workspace unlock token (hosted env): use the same string configured in `REVIEWER_TOKEN` on Render.

## Stack Overview

| Layer     | Tech                                                    |
|-----------|---------------------------------------------------------|
| Frontend  | Vite + React 18 + TypeScript + Tailwind (soon)          |
| Backend   | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic Settings     |
| Database  | PostgreSQL 15 (SQLite fallback for local dev)           |
| Infra     | Docker Compose (db, backend API, React dev server)      |

## Getting Started

1. **Clone & install**
   ```bash
   git clone <repo>
   cd aq-swe-take-home
   python3 -m venv backend/.venv && source backend/.venv/bin/activate
   pip install -r backend/requirements.txt
   cd frontend && npm install
   ```

2. **Environment**
   ```bash
   cp .env.example .env
   ```
   Adjust `DATABASE_URL` if you are not using Docker for Postgres.

3. **Run services (dev)**
   ```bash
   # Terminal 1
   cd backend && source .venv/bin/activate
   uvicorn app.main:app --reload --port 8000

   # Terminal 2
   cd frontend
   npm run dev -- --host 0.0.0.0 --port 5173
   ```
   - API ➜ http://localhost:8000/docs
   - React dev server ➜ http://localhost:5173 (or 4173 for preview)

4. **Seed sample data**
   ```bash
   source backend/.venv/bin/activate
   python scripts/seed_data.py
   ```

## Backend Structure

```
backend/
  app/
    api/v1/routes        # FastAPI routers
    core                 # settings/config
    db                   # session helpers
    models               # SQLAlchemy models
    schemas              # Pydantic schemas
```

Alembic configuration lives under `backend/alembic`. Run migrations with:

```bash
cd backend
alembic upgrade head
```

## Frontend Structure

`frontend/` hosts the React authoring UI (Vite + TS). Key areas:

- `src/api/` – lightweight fetch client plus shared DTOs.
- `src/App.tsx` – problem builder surface (form, test-case composer, Monaco editor, run-results table).
- `src/App.css` – layout + component styling (no Tailwind needed yet).

Set `VITE_API_BASE_URL` (defaults to `http://localhost:8000/api/v1`) if you expose the backend elsewhere. Start the UI with:

```bash
cd frontend
npm install
npm run dev
```

## Scripts & Tooling

- `Makefile` offers shortcuts such as `make run-backend`, `make seed-data`, and `make docker-up`.
- `scripts/seed_data.py` loads a demo user + “Sum Two Numbers” problem for smoke testing.
- `shared/types/` will eventually host generated API contracts for cross-stack safety.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_NAME` | Friendly name exposed by FastAPI docs. | `AQ Code Platform` |
| `API_V1_PREFIX` | Base path for versioned routes. | `/api/v1` |
| `DATABASE_URL` | SQLAlchemy DSN (`postgresql+psycopg2://…`). | `sqlite:///./app.db` |
| `ALLOWED_CORS_ORIGINS` | Comma‑separated list of origins for CORS. | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173` |
| `REVIEWER_TOKEN` | Shared secret reviewers enter to unlock admin tools. | _unset_ |
| `VITE_API_BASE_URL` | Frontend → backend base URL. | `http://localhost:8000/api/v1` |

## Execution API

- `POST /api/v1/execute` runs the submitted Python solution against every test case for the target problem.
- Guardrails: stripped imports for `os`/`subprocess`, recursion limit enforced, per-run timeout (3s) and output cap (10k chars).
- Response includes a summary plus per-test pass/fail details; hidden tests mask their input/output but still report status.

Sample request:

```bash
curl -X POST http://localhost:8000/api/v1/execute \
  -H "Content-Type: application/json" \
  -d '{"problem_id": 1, "code": "print(sum(map(int, input().split())))"}'
```

## Submission Lifecycle

- `POST /api/v1/submissions/{id}/submit` snapshots the current problem + tests, ties in the latest execution result, and creates/refreshes a pending review entry.
- `GET /api/v1/submissions?submitter_name=alice&problem_id=1` returns versioned submissions (status chip, reviewer feedback, stdout/stderr logs, and the immutable test-case snapshot for that run).
- Frontend surfaces this under **My Submissions** with filters per problem so authors can track pending/approved/rejected entries.
- Reviewer workspace: enter a reviewer token (any string) to unlock the admin dashboard. Pending submissions are listed with search/status filters; clicking a row opens the detail view where reviewers can tweak the underlying problem test cases (via the existing editor), rerun the user’s code against those tests, and mark the submission approved/rejected with contextual feedback.

## Tests

```bash
cd aq-swe-take-home
source backend/.venv/bin/activate
PYTHONPATH=backend pytest backend/tests
cd frontend
npm run build
```

### End-to-End

1. Start the API (`cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000`).
2. Start the frontend (`cd frontend && npm run dev`).
3. In another terminal run (from repo root):
   ```bash
   E2E_BASE_URL=http://localhost:4173 npm run test:e2e
   ```
   Tests live in `tests/e2e/` (Playwright). Ensure both dev servers are up first.

## Deployment

### Backend (Render)

- Production image is built from `docker/backend.Dockerfile` and served via Gunicorn.
- Render environment:
  - `DATABASE_URL` → Render Postgres internal URL.
  - `ALLOWED_CORS_ORIGINS` → `https://inspiring-griffin-dc6e8c.netlify.app,http://localhost:5173`.
  - `REVIEWER_TOKEN` → reviewer-shared secret.
- Health: `https://aq-swe-take-backend.onrender.com/health`.

### Frontend (Netlify)

- Build command `npm install && npm run build`, base dir `frontend`, publish `dist`.
- `VITE_API_BASE_URL` → `https://aq-swe-take-backend.onrender.com/api/v1`.
- Live site: https://inspiring-griffin-dc6e8c.netlify.app.

### Telemetry & Logging

- FastAPI logs (stdout) are ingested automatically by Render; reviewer/executor routes emit JSON blobs describing submitter, problem, pass/fail counts, durations, and reviewer actions.
- Future enhancement: wrap these with `structlog` or Ship the logs to a lightweight sink (e.g., Logtail) and expose a `/metrics` stub for ops dashboards.

### Reviewer Tokens

Reviewer mode is intentionally lightweight for the take-home: any non-empty string in the “Reviewer token” input unlocks the admin dashboard. In production, wire this field to real authentication/SSO and map reviewer identities via JWT/headers before trusting their actions.

## Next Stages

1. Implement execution sandbox & test harness.
2. Build problem authoring UI/flows.
3. Wire submission lifecycle + reviewer dashboard.
4. Deploy to public cloud target.

See project board / instructions for the stretch goals ordering (multi-language, fuzzing, version history, terminal box).

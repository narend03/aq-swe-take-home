# Code Execution Platform

Lightweight platform where users author coding challenges, write solutions, and run them against curated test cases before submitting for review. Reviewers can inspect runs, tweak hidden cases, and approve/reject entries.

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
   docker compose up --build
   ```
   - API ➜ http://localhost:8000/docs
   - React dev server ➜ http://localhost:5173

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

`frontend/` currently contains the stock Vite React + TS template. Stage 2+ will introduce the actual UI, shared components, and API client bindings generated from backend schemas.

## Scripts & Tooling

- `Makefile` offers shortcuts such as `make run-backend`, `make seed-data`, and `make docker-up`.
- `scripts/seed_data.py` loads a demo user + “Sum Two Numbers” problem for smoke testing.
- `shared/types/` will eventually host generated API contracts for cross-stack safety.

## Next Stages

1. Implement execution sandbox & test harness.
2. Build problem authoring UI/flows.
3. Wire submission lifecycle + reviewer dashboard.
4. Deploy to public cloud target.

See project board / instructions for the stretch goals ordering (multi-language, fuzzing, version history, terminal box).

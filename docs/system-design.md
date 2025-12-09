# System Design Overview

Single-page React frontend talks to a FastAPI backend that owns problem authoring, code execution, submissions, and reviewer workflow. Persistence is PostgreSQL (SQLite for local). Execution is an in-process Python sandbox with guardrails (timeouts, banned imports, output caps).

## Architecture
- **Frontend (Vite + React + TS):** Author problems/tests, run code, view results, submit for review, reviewer console. API base via `VITE_API_BASE_URL`.
- **Backend (FastAPI + SQLAlchemy + Alembic):** REST at `/api/v1`. Domain: Problems, TestCases, Submissions, ExecutionResults, Reviews, SubmissionTestCaseSnapshots, optional Users. Settings via Pydantic.
- **Execution engine:** Local Python subprocess per run with regex sanitization, recursion limit, 3s timeout, 10k-char stdout/stderr cap. No container isolation yet.
- **Storage:** Relational DB. Alembic migrations under `backend/alembic/`.
- **Deploy:** Backend -> Render (Gunicorn); Frontend -> Netlify; Dev via Docker Compose.

## Data Model (simplified)
- `Problem` (title, description, example_input/output, author?) ↔ `TestCase` (input_data, expected_output, is_hidden, cascade delete).
- `Submission` (problem_id, code, language, submitter_name, snapshots of problem/text cases, submitted_at, latest_execution_result_id).
- `ExecutionResult` (submission_id, status, pass/fail counts, stdout/stderr, runtime_ms, run_at).
- `SubmissionTestCaseSnapshot` (submission_id, input_data, expected_output, is_hidden) to freeze state at submit.
- `Review` (submission_id unique, status pending/approved/rejected, feedback, reviewer?).
- `User` (optional author/reviewer linkage; not required for flows).

## Core Flows
### Authoring
1. Create/update Problem + TestCases (`POST/PUT /problems`).
2. Test cases stored relationally; updates replace the set.

### Execute (author run)
1. Frontend `Run Tests` -> `POST /execute/` with problem_id, code, submitter_name.
2. Backend loads test cases, sanitizes code, runs each case with executor.
3. Persists Submission + ExecutionResult (latest linked) even before review.
4. Response hides hidden inputs/expected outputs but includes pass/fail counts and errors.

### Submit for review
1. `POST /submissions/{id}/submit` requires an execution exists and not already submitted.
2. Snapshots problem title/description/examples and all test cases into `SubmissionTestCaseSnapshot`.
3. Creates/refreshes Review to `pending` (stores optional notes), stamps submitted_at.

### Reviewer workspace
1. Reviewer enters token (any non-empty string; no real auth) to unlock UI.
2. Lists submissions (filters: status/search/problem/user) via `GET /submissions`.
3. Detail view `GET /submissions/{id}` shows snapshot vs current problem, stdout/stderr, code.
4. Rerun (optional code override) via `POST /submissions/{id}/rerun` creates new ExecutionResult and updates latest pointer (code updated if override provided).
5. Approve/reject via `POST /submissions/{id}/review` sets status/feedback.

## Backend Design
- **Entry:** `app/main.py` wires settings, CORS, API router, and dev-time `Base.metadata.create_all`.
- **Settings:** `app/core/config.py` with env `.env`; CORS defaults to localhost dev origins.
- **Persistence:** SQLAlchemy 2.0 models in `app/models/entities.py`; sessions via `app/db/session.py`; migrations in Alembic versions.
- **Schemas:** Pydantic models in `app/schemas/*` for validation/serialization.
- **Routers:** `api/v1/routes/problems.py`, `executions.py`, `submissions.py`; grouped under `api/v1/api.py`.
- **Executor:** `app/services/executor.py` handles sanitization and per-test subprocess runs.

## Frontend Design
- **Entry:** `src/App.tsx` single surface with sidebar problem list, editor, test-case builder, Monaco editor, results table, submissions list, and reviewer workspace.
- **State/query:** TanStack Query for fetching/mutations; localStorage for draft problem, user name, reviewer token.
- **API client:** `src/api/client.ts` wraps fetch with JSON helpers and base URL env.
- **UX guards:** Requires name before running; requires saved problem and successful run before submit-for-review; autosaves drafts before first save.

## Execution Guardrails & Limitations
- Banned imports: `os`, `subprocess`, `__import__` (regex).
- Prepends recursion limit set to 1000.
- Timeout: 3s per test; output cap: 10k chars for stdout/stderr.
- No container/FS/CPU/memory isolation—security/perf is best-effort only. For production: move to sandboxed runners (Docker/Firecracker), resource limits, seccomp/AppArmor, network off, per-user quotas.

## Security & Auth Notes
- Reviewer mode is token-only (any non-empty string) on both FE/BE; no user identity or authZ.
- CORS controlled by env; defaults to localhost dev origins.
- No rate limiting or abuse controls; executor runs on API node.

## Scaling & Future Enhancements
- **Execution isolation:** External sandbox service/worker queue; per-run CPU/mem limits; language-specific containers; streaming logs.
- **Observability:** Structured logs/metrics; execution traces; reviewer audit trail.
- **Auth:** Real auth for authors/reviewers; role-based access; JWT/SSO integration.
- **Versioning:** Immutable problem versions; diffing current vs snapshot; history browser.
- **Features:** Multi-language support, fuzzing, richer IDE, collaboration, tagging/ownership for problems.
- **Performance:** Cache problem lists; paginate submissions; async tasks for heavy runs; DB indexing on filters (status, problem_id, submitter_name).

## Deploy & Dev
- **Local dev:** `uvicorn app.main:app --reload --port 8000`; `npm run dev -- --host 0.0.0.0 --port 5173`; Docker Compose available for backend+db+frontend.
- **Seed data:** `python scripts/seed_data.py` seeds sample problem for smoke tests.
- **Prod env:** Backend on Render (Gunicorn image from `docker/backend.Dockerfile`), Frontend on Netlify (`npm run build`, base `frontend`, publish `dist`). Env vars: `DATABASE_URL`, `ALLOWED_CORS_ORIGINS`, `REVIEWER_TOKEN`, `VITE_API_BASE_URL`.

## Tooling Rationale (why these choices)
- **FastAPI + Pydantic:** Quick to build typed HTTP APIs with clear validation and auto docs; async-friendly and lightweight for a take-home scope.
- **SQLAlchemy 2.0 + Alembic:** Declarative models with migrations for evolving schema; portable between SQLite (dev) and Postgres (prod).
- **PostgreSQL (SQLite locally):** Reliable relational store with JSON/text support; SQLite keeps dev friction low while schema stays compatible.
- **Vite + React + TypeScript:** Fast dev server and TS safety for the single-page authoring/reviewer UI; minimal boilerplate.
- **TanStack Query:** Handles caching/loading/error states for API calls, keeping UI logic simple.
- **Monaco Editor:** Familiar code-editing experience with syntax highlighting for the solution area.
- **Docker Compose:** One-command local stack for API + DB + frontend; mirrors prod services cleanly.
- **Render (backend) + Netlify (frontend):** Managed hosting with simple build commands, good defaults for a small service, and minimal ops overhead.


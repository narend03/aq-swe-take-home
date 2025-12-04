PYTHON=python3
BACKEND_DIR=backend

.PHONY: install-backend run-backend seed-data docker-up docker-down lint-backend

install-backend:
	cd $(BACKEND_DIR) && $(PYTHON) -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

run-backend:
	cd $(BACKEND_DIR) && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

seed-data:
	. backend/.venv/bin/activate && $(PYTHON) scripts/seed_data.py

lint-backend:
	cd $(BACKEND_DIR) && . .venv/bin/activate && ruff check app

docker-up:
	docker compose up --build

docker-down:
	docker compose down

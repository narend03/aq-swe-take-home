"""Populate the local database with a starter user and sample problem."""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = BASE_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.append(str(BACKEND_DIR))

from app.db.session import SessionLocal, engine  # noqa: E402
from app.models import Base, Problem, TestCase, User  # noqa: E402


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        demo_user = session.query(User).filter_by(email="demo@example.com").first()
        if not demo_user:
            demo_user = User(email="demo@example.com", display_name="Demo Author")
            session.add(demo_user)
            session.flush()

        existing_problem = session.query(Problem).filter_by(title="Sum Two Numbers").first()
        if existing_problem:
            print("Sample data already populated. Skipping.")
            return

        problem = Problem(
            title="Sum Two Numbers",
            description="Return the sum of two integers provided as input.",
            example_input="2 5",
            example_output="7",
            author_id=demo_user.id,
        )
        problem.test_cases = [
            TestCase(input_data="1 2", expected_output="3", is_hidden=False),
            TestCase(input_data="100 -4", expected_output="96", is_hidden=True),
        ]
        session.add(problem)
        session.commit()
        print("Seed data inserted.")


if __name__ == "__main__":
    seed()

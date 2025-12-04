from typing import Dict

from fastapi import FastAPI
from sqlalchemy import text

from app.api.v1.api import api_router
from app.core.config import get_settings
from app.db.session import engine
from app.models import Base

settings = get_settings()
app = FastAPI(title=settings.app_name)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.on_event("startup")
def startup_event() -> None:
    # Ensure metadata is created during early development; Alembic will own in prod
    Base.metadata.create_all(bind=engine)


@app.get("/health", tags=["health"])
def health_check() -> Dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok"}

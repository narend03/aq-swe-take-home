from fastapi import APIRouter

from app.api.v1.routes import executions, problems, submissions

api_router = APIRouter()
api_router.include_router(problems.router)
api_router.include_router(executions.router)
api_router.include_router(submissions.router)

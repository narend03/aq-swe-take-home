from typing import List, Optional

from pydantic import BaseModel, field_validator

from app.schemas.test_case import TestCaseCreate, TestCaseRead


class ProblemBase(BaseModel):
    title: str
    description: str
    example_input: str
    example_output: str

    @field_validator("title", "description", "example_input", "example_output")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("All textual fields must be present")
        return value


class ProblemCreate(ProblemBase):
    test_cases: List[TestCaseCreate] = []


class ProblemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    example_input: Optional[str] = None
    example_output: Optional[str] = None


class ProblemRead(ProblemBase):
    id: int
    test_cases: List[TestCaseRead] = []

    class Config:
        from_attributes = True

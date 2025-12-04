from typing import Optional

from pydantic import BaseModel, field_validator


class TestCaseBase(BaseModel):
    input_data: str
    expected_output: str
    is_hidden: bool = False

    @field_validator("input_data", "expected_output")
    @classmethod
    def not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Input and expected output must be provided")
        return value


class TestCaseCreate(TestCaseBase):
    pass


class TestCaseUpdate(BaseModel):
    input_data: Optional[str] = None
    expected_output: Optional[str] = None
    is_hidden: Optional[bool] = None


class TestCaseRead(TestCaseBase):
    id: int

    class Config:
        from_attributes = True

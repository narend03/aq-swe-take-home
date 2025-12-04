from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ExecutionRequest(BaseModel):
    problem_id: int
    code: str = Field(min_length=1)
    language: str = Field(default="python", description="Programming language identifier")


class ExecutionTestCaseResult(BaseModel):
    test_case_id: int
    is_hidden: bool
    passed: bool
    input_data: Optional[str]
    expected_output: Optional[str]
    actual_output: Optional[str]
    stdout: Optional[str]
    stderr: Optional[str]
    error: Optional[str]
    runtime_ms: int


class ExecutionSummary(BaseModel):
    status: str
    passed_count: int
    failed_count: int


class ExecutionResponse(BaseModel):
    submission_id: int
    summary: ExecutionSummary
    results: List[ExecutionTestCaseResult]

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.execution import ExecutionSummary
from app.schemas.problem import ProblemRead
from app.schemas.test_case import TestCaseRead


class SubmissionTestCaseSnapshotRead(BaseModel):
    id: int
    input_data: str
    expected_output: str
    is_hidden: bool

    class Config:
        from_attributes = True


class SubmissionReviewInfo(BaseModel):
    status: str
    feedback: Optional[str] = None


class SubmissionRead(BaseModel):
    id: int
    problem_id: int
    problem_title: str
    submitter_name: Optional[str]
    submitted_at: Optional[datetime]
    review: SubmissionReviewInfo
    execution_summary: ExecutionSummary
    stdout: Optional[str]
    stderr: Optional[str]
    test_cases: List[SubmissionTestCaseSnapshotRead]
    code: str
    problem_description_snapshot: Optional[str]
    example_input_snapshot: Optional[str]
    example_output_snapshot: Optional[str]

    class Config:
        from_attributes = True


class SubmissionDetail(SubmissionRead):
    current_problem: ProblemRead
    current_test_cases: List[TestCaseRead]


class SubmissionSubmitRequest(BaseModel):
    notes: Optional[str] = None


class SubmissionReviewRequest(BaseModel):
    status: str
    feedback: Optional[str] = None


class SubmissionRerunRequest(BaseModel):
    code_override: Optional[str] = None


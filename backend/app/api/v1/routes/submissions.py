from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_db_session
from app.models import ExecutionResult, Problem, Review, Submission, SubmissionTestCaseSnapshot, TestCase
from app.schemas.execution import ExecutionSummary
from app.schemas.problem import ProblemRead
from app.schemas.submission import (
    SubmissionDetail,
    SubmissionRead,
    SubmissionReviewInfo,
    SubmissionReviewRequest,
    SubmissionRerunRequest,
    SubmissionSubmitRequest,
    SubmissionTestCaseSnapshotRead,
)
from app.schemas.test_case import TestCaseRead
from app.services.executor import CodeExecutor, ExecutorTestCase, SanitizationError

router = APIRouter(prefix="/submissions", tags=["submissions"])


def _build_submission_read(submission: Submission) -> SubmissionRead:
    review = submission.review
    review_info = SubmissionReviewInfo(
        status=review.status if review else "pending",
        feedback=review.feedback if review else None,
    )
    execution = submission.latest_execution_result
    execution_summary = ExecutionSummary(
        status=execution.status if execution else "unknown",
        passed_count=execution.passed_count if execution else 0,
        failed_count=execution.failed_count if execution else 0,
    )
    test_case_snapshots = [
        SubmissionTestCaseSnapshotRead.model_validate(snapshot)
        for snapshot in submission.test_case_snapshots
    ]

    return SubmissionRead(
        id=submission.id,
        problem_id=submission.problem_id,
        problem_title=submission.problem_title_snapshot or submission.problem.title,
        submitter_name=submission.submitter_name,
        submitted_at=submission.submitted_at,
        review=review_info,
        execution_summary=execution_summary,
        stdout=execution.stdout if execution else None,
        stderr=execution.stderr if execution else None,
        test_cases=test_case_snapshots,
        code=submission.code,
        problem_description_snapshot=submission.problem_description_snapshot
        or submission.problem.description,
        example_input_snapshot=submission.example_input_snapshot or submission.problem.example_input,
        example_output_snapshot=submission.example_output_snapshot
        or submission.problem.example_output,
    )


def _build_submission_detail(submission: Submission) -> SubmissionDetail:
    base = _build_submission_read(submission)
    current_problem = ProblemRead.model_validate(submission.problem)
    current_tests = [TestCaseRead.model_validate(tc) for tc in submission.problem.test_cases]
    return SubmissionDetail(
        **base.model_dump(),
        current_problem=current_problem,
        current_test_cases=current_tests,
    )


@router.post("/{submission_id}/submit", response_model=SubmissionRead)
def submit_for_review(
    submission_id: int,
    payload: SubmissionSubmitRequest,
    db: Session = Depends(get_db_session),
) -> SubmissionRead:
    submission = (
        db.query(Submission)
        .options(
            selectinload(Submission.problem).selectinload(Problem.test_cases),
            selectinload(Submission.test_case_snapshots),
            joinedload(Submission.review),
            joinedload(Submission.latest_execution_result),
        )
        .filter_by(id=submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if submission.submitted_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submission already sent for review")

    if not submission.latest_execution_result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Run tests before submitting for review"
        )

    problem = submission.problem
    submission.problem_title_snapshot = problem.title
    submission.problem_description_snapshot = problem.description
    submission.example_input_snapshot = problem.example_input
    submission.example_output_snapshot = problem.example_output
    submission.submitted_at = datetime.utcnow()

    submission.test_case_snapshots.clear()
    for test_case in problem.test_cases:
        submission.test_case_snapshots.append(
            SubmissionTestCaseSnapshot(
                input_data=test_case.input_data,
                expected_output=test_case.expected_output,
                is_hidden=test_case.is_hidden,
            )
        )

    if submission.review:
        submission.review.status = "pending"
        if payload.notes:
            submission.review.feedback = payload.notes
    else:
        db.add(
            Review(
                submission_id=submission.id,
                status="pending",
                feedback=payload.notes,
            )
        )

    db.add(submission)
    db.commit()
    db.refresh(submission)

    return _build_submission_read(submission)


@router.post("/{submission_id}/rerun", response_model=SubmissionRead)
def rerun_submission(
    submission_id: int,
    payload: SubmissionRerunRequest,
    db: Session = Depends(get_db_session),
) -> SubmissionRead:
    submission = (
        db.query(Submission)
        .options(
            joinedload(Submission.problem).joinedload(Problem.test_cases),
            joinedload(Submission.latest_execution_result),
            joinedload(Submission.review),
            selectinload(Submission.test_case_snapshots),
        )
        .filter_by(id=submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    problem = submission.problem
    test_cases: List[TestCase] = problem.test_cases
    if not test_cases:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Problem has no test cases")

    executor = CodeExecutor()
    executor_cases = [
        ExecutorTestCase(
            id=tc.id or index,
            input_data=tc.input_data,
            expected_output=tc.expected_output,
            is_hidden=tc.is_hidden,
        )
        for index, tc in enumerate(test_cases, start=1)
    ]
    code_to_run = payload.code_override if payload.code_override is not None else submission.code

    try:
        case_results = executor.run(code_to_run, executor_cases)
    except SanitizationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Execution failed"
        ) from exc

    passed_count = sum(1 for result in case_results if result.passed)
    failed_count = len(case_results) - passed_count
    status_label = "passed" if failed_count == 0 else "failed"

    execution_record = ExecutionResult(
        submission_id=submission.id,
        status=status_label,
        passed_count=passed_count,
        failed_count=failed_count,
        stdout="\n".join(filter(None, (result.stdout for result in case_results))) or None,
        stderr="\n".join(filter(None, (result.stderr or result.error for result in case_results))) or None,
        runtime_ms=sum(result.runtime_ms for result in case_results),
    )
    db.add(execution_record)
    db.flush()
    submission.latest_execution_result_id = execution_record.id
    if payload.code_override is not None:
        submission.code = payload.code_override
    db.add(submission)
    db.commit()
    db.refresh(submission)

    return _build_submission_read(submission)


@router.post("/{submission_id}/review", response_model=SubmissionRead)
def review_submission(
    submission_id: int,
    payload: SubmissionReviewRequest,
    db: Session = Depends(get_db_session),
) -> SubmissionRead:
    submission = (
        db.query(Submission)
        .options(
            joinedload(Submission.review),
            joinedload(Submission.latest_execution_result),
            selectinload(Submission.test_case_snapshots),
            joinedload(Submission.problem),
        )
        .filter_by(id=submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if not submission.submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Submission not ready for review"
        )
    status_value = payload.status.lower()
    if status_value not in {"approved", "rejected", "pending"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid review status")

    if submission.review:
        submission.review.status = status_value
        submission.review.feedback = payload.feedback
    else:
        db.add(
            Review(
                submission_id=submission.id,
                status=status_value,
                feedback=payload.feedback,
            )
        )

    db.add(submission)
    db.commit()
    db.refresh(submission)
    return _build_submission_read(submission)


@router.get("/{submission_id}", response_model=SubmissionDetail)
def get_submission_detail(
    submission_id: int,
    db: Session = Depends(get_db_session),
) -> SubmissionDetail:
    submission = (
        db.query(Submission)
        .options(
            joinedload(Submission.review),
            joinedload(Submission.latest_execution_result),
            joinedload(Submission.problem).joinedload(Problem.test_cases),
            selectinload(Submission.test_case_snapshots),
        )
        .filter_by(id=submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return _build_submission_detail(submission)


@router.get("/", response_model=List[SubmissionRead])
def list_submissions(
    submitter_name: Optional[str] = Query(default=None),
    problem_id: Optional[int] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db_session),
) -> List[SubmissionRead]:
    query = (
        db.query(Submission)
        .options(
            selectinload(Submission.test_case_snapshots),
            joinedload(Submission.review),
            joinedload(Submission.problem),
            joinedload(Submission.latest_execution_result),
        )
        .filter(Submission.submitted_at.isnot(None))
    )

    if submitter_name:
        query = query.filter(Submission.submitter_name == submitter_name)
    if problem_id:
        query = query.filter(Submission.problem_id == problem_id)
    if status_filter:
        query = query.join(Submission.review).filter(Review.status == status_filter)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Submission.submitter_name.ilike(like),
                Submission.problem_title_snapshot.ilike(like),
            )
        )

    submissions = query.order_by(desc(Submission.submitted_at)).all()
    return [_build_submission_read(item) for item in submissions]


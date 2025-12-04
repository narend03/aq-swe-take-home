from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.models import ExecutionResult, Problem, Submission, TestCase
from app.schemas.execution import ExecutionRequest, ExecutionResponse, ExecutionSummary, ExecutionTestCaseResult
from app.services.executor import CodeExecutor, ExecutorCaseResult, ExecutorTestCase, SanitizationError

router = APIRouter(prefix="/execute", tags=["execute"])


def _to_executor_case(test_case: TestCase) -> ExecutorTestCase:
    return ExecutorTestCase(
        id=test_case.id,
        input_data=test_case.input_data,
        expected_output=test_case.expected_output,
        is_hidden=test_case.is_hidden,
    )


def _mask_if_hidden(value: str, is_hidden: bool) -> Optional[str]:
    return None if is_hidden else value


def _to_response_case(result: ExecutorCaseResult, test_case: TestCase) -> ExecutionTestCaseResult:
    return ExecutionTestCaseResult(
        test_case_id=result.test_case_id,
        is_hidden=test_case.is_hidden,
        passed=result.passed,
        input_data=_mask_if_hidden(test_case.input_data, test_case.is_hidden),
        expected_output=_mask_if_hidden(test_case.expected_output, test_case.is_hidden),
        actual_output=result.actual_output,
        stdout=None if test_case.is_hidden else result.stdout,
        stderr=None if test_case.is_hidden else result.stderr,
        error=result.error,
        runtime_ms=result.runtime_ms,
    )


@router.post("/", response_model=ExecutionResponse, status_code=status.HTTP_200_OK)
def execute_solution(
    payload: ExecutionRequest,
    db: Session = Depends(get_db_session),
) -> ExecutionResponse:
    problem = db.get(Problem, payload.problem_id)
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    test_cases: List[TestCase] = problem.test_cases
    if not test_cases:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Problem has no test cases")

    executor = CodeExecutor()
    executor_cases = [_to_executor_case(tc) for tc in test_cases]
    try:
        case_results = executor.run(payload.code, executor_cases)
    except SanitizationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - safety net
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Execution failed") from exc

    passed_count = sum(1 for result in case_results if result.passed)
    failed_count = len(case_results) - passed_count
    status_label = "passed" if failed_count == 0 else "failed"

    submission = Submission(
        problem_id=problem.id,
        code=payload.code,
        language=payload.language,
    )
    db.add(submission)
    db.flush()

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
    db.commit()

    summary = ExecutionSummary(status=status_label, passed_count=passed_count, failed_count=failed_count)
    response_cases = [_to_response_case(result, tc) for result, tc in zip(case_results, test_cases)]
    return ExecutionResponse(submission_id=submission.id, summary=summary, results=response_cases)

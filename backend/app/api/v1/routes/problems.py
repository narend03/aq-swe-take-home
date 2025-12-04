from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.models import Problem, TestCase
from app.schemas.problem import ProblemCreate, ProblemRead, ProblemUpdate
from app.schemas.test_case import TestCaseCreate, TestCaseRead, TestCaseUpdate

router = APIRouter(prefix="/problems", tags=["problems"])


@router.get("/", response_model=List[ProblemRead])
def list_problems(db: Session = Depends(get_db_session)) -> List[Problem]:
    return db.query(Problem).order_by(Problem.created_at.desc()).all()


@router.post("/", response_model=ProblemRead, status_code=status.HTTP_201_CREATED)
def create_problem(
    payload: ProblemCreate, db: Session = Depends(get_db_session)
) -> Problem:
    problem = Problem(
        title=payload.title,
        description=payload.description,
        example_input=payload.example_input,
        example_output=payload.example_output,
    )
    for test_case in payload.test_cases:
        problem.test_cases.append(
            TestCase(
                input_data=test_case.input_data,
                expected_output=test_case.expected_output,
                is_hidden=test_case.is_hidden,
            )
        )
    db.add(problem)
    db.commit()
    db.refresh(problem)
    return problem


@router.get("/{problem_id}", response_model=ProblemRead)
def get_problem(problem_id: int, db: Session = Depends(get_db_session)) -> Problem:
    problem = db.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")
    return problem


@router.put("/{problem_id}", response_model=ProblemRead)
def update_problem(
    problem_id: int, payload: ProblemUpdate, db: Session = Depends(get_db_session)
) -> Problem:
    problem = db.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    payload_data = payload.model_dump(exclude_unset=True)
    test_cases_payload = payload_data.pop("test_cases", None)

    for field, value in payload_data.items():
        setattr(problem, field, value)

    if test_cases_payload is not None:
        problem.test_cases.clear()
        for test_case in test_cases_payload:
            problem.test_cases.append(
                TestCase(
                    input_data=test_case.input_data,
                    expected_output=test_case.expected_output,
                    is_hidden=test_case.is_hidden,
                )
            )

    db.add(problem)
    db.commit()
    db.refresh(problem)
    return problem


@router.delete("/{problem_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_problem(problem_id: int, db: Session = Depends(get_db_session)) -> None:
    problem = db.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")
    db.delete(problem)
    db.commit()


@router.get("/{problem_id}/test-cases", response_model=List[TestCaseRead])
def list_test_cases(problem_id: int, db: Session = Depends(get_db_session)) -> List[TestCase]:
    problem = db.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")
    return problem.test_cases


@router.post("/{problem_id}/test-cases", response_model=TestCaseRead, status_code=status.HTTP_201_CREATED)
def create_test_case(
    problem_id: int,
    payload: TestCaseCreate,
    db: Session = Depends(get_db_session),
) -> TestCase:
    problem = db.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")
    test_case = TestCase(
        problem_id=problem_id,
        input_data=payload.input_data,
        expected_output=payload.expected_output,
        is_hidden=payload.is_hidden,
    )
    db.add(test_case)
    db.commit()
    db.refresh(test_case)
    return test_case


@router.put("/test-cases/{test_case_id}", response_model=TestCaseRead)
def update_test_case(
    test_case_id: int,
    payload: TestCaseUpdate,
    db: Session = Depends(get_db_session),
) -> TestCase:
    test_case = db.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(test_case, field, value)

    db.add(test_case)
    db.commit()
    db.refresh(test_case)
    return test_case


@router.delete("/test-cases/{test_case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(test_case_id: int, db: Session = Depends(get_db_session)) -> None:
    test_case = db.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")

    db.delete(test_case)
    db.commit()

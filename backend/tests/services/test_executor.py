from app.services.executor import CodeExecutor, ExecutorTestCase, SanitizationError


def test_executor_success_case():
    executor = CodeExecutor(timeout_seconds=2)
    test_cases = [
        ExecutorTestCase(id=1, input_data="2 3", expected_output="5"),
        ExecutorTestCase(id=2, input_data="10 -4", expected_output="6"),
    ]
    code = """
values = list(map(int, input().split()))
print(sum(values))
"""
    results = executor.run(code, test_cases)
    assert all(result.passed for result in results)
    assert results[0].actual_output == "5"


def test_executor_detects_mismatch():
    executor = CodeExecutor(timeout_seconds=2)
    test_cases = [ExecutorTestCase(id=1, input_data="2 3", expected_output="5")]
    code = """
print(0)
"""
    results = executor.run(code, test_cases)
    assert results[0].passed is False
    assert results[0].error == "Output mismatch"


def test_executor_timeout():
    executor = CodeExecutor(timeout_seconds=0.5)
    test_cases = [ExecutorTestCase(id=1, input_data="", expected_output="")]
    code = """
while True:
    pass
"""
    results = executor.run(code, test_cases)
    assert results[0].passed is False
    assert "timed out" in results[0].error.lower()


def test_executor_sanitization_blocked():
    executor = CodeExecutor()
    test_cases = [ExecutorTestCase(id=1, input_data="", expected_output="")]
    code = """
import os
print('hi')
"""
    try:
        executor.run(code, test_cases)
        assert False, "Expected SanitizationError"
    except SanitizationError as exc:
        assert "restricted" in str(exc)

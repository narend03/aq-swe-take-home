from __future__ import annotations

import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence

GUARD_PREFIX = "import sys\nsys.setrecursionlimit(1000)\n"
BANNED_PATTERNS = (
    re.compile(r"^\s*import\s+os\b", re.MULTILINE),
    re.compile(r"^\s*from\s+os\b", re.MULTILINE),
    re.compile(r"^\s*import\s+subprocess\b", re.MULTILINE),
    re.compile(r"^\s*from\s+subprocess\b", re.MULTILINE),
    re.compile(r"__import__"),
)
DEFAULT_TIMEOUT_SECONDS = 3.0
MAX_OUTPUT_CHARS = 10_000


class ExecutionError(Exception):
    """Base exception for executor failures."""


class SanitizationError(ExecutionError):
    """Raised when submitted code violates guardrails."""


@dataclass
class ExecutorTestCase:
    id: int
    input_data: str
    expected_output: str
    is_hidden: bool = False


@dataclass
class ExecutorCaseResult:
    test_case_id: int
    passed: bool
    actual_output: str | None
    stdout: str
    stderr: str
    error: str | None
    runtime_ms: int


class CodeExecutor:
    def __init__(
        self,
        python_executable: str | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        output_char_limit: int = MAX_OUTPUT_CHARS,
    ) -> None:
        self.python_executable = python_executable or sys.executable
        self.timeout_seconds = timeout_seconds
        self.output_char_limit = output_char_limit

    def run(self, code: str, test_cases: Sequence[ExecutorTestCase]) -> List[ExecutorCaseResult]:
        sanitized_code = self._sanitize_code(code)
        if not test_cases:
            raise ExecutionError("No test cases to execute")

        with tempfile.TemporaryDirectory() as temp_dir:
            solution_path = Path(temp_dir) / "solution.py"
            solution_path.write_text(GUARD_PREFIX + sanitized_code, encoding="utf-8")

            results: List[ExecutorCaseResult] = []
            for case in test_cases:
                result = self._run_single_case(solution_path, case)
                results.append(result)
            return results

    def _run_single_case(self, solution_path: Path, case: ExecutorTestCase) -> ExecutorCaseResult:
        start = time.perf_counter()
        try:
            completed = subprocess.run(
                [self.python_executable, str(solution_path)],
                input=case.input_data,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
                check=False,
            )
            runtime_ms = int((time.perf_counter() - start) * 1000)
            stdout = completed.stdout
            stderr = completed.stderr

            if len(stdout) > self.output_char_limit or len(stderr) > self.output_char_limit:
                return ExecutorCaseResult(
                    test_case_id=case.id,
                    passed=False,
                    actual_output=None,
                    stdout=stdout[: self.output_char_limit],
                    stderr=stderr[: self.output_char_limit],
                    error="Output exceeded allowed limit",
                    runtime_ms=runtime_ms,
                )

            actual_output = stdout.strip() if stdout else ""
            expected_output = case.expected_output.strip()
            passed = completed.returncode == 0 and actual_output == expected_output
            error_msg = None
            if not passed:
                error_msg = stderr.strip() or "Output mismatch"

            return ExecutorCaseResult(
                test_case_id=case.id,
                passed=passed,
                actual_output=actual_output,
                stdout=stdout,
                stderr=stderr,
                error=error_msg,
                runtime_ms=runtime_ms,
            )
        except subprocess.TimeoutExpired:
            runtime_ms = int((time.perf_counter() - start) * 1000)
            return ExecutorCaseResult(
                test_case_id=case.id,
                passed=False,
                actual_output=None,
                stdout="",
                stderr="",
                error=f"Execution timed out after {self.timeout_seconds} seconds",
                runtime_ms=runtime_ms,
            )

    def _sanitize_code(self, code: str) -> str:
        stripped = code.strip()
        if not stripped:
            raise SanitizationError("Solution code cannot be empty")
        for pattern in BANNED_PATTERNS:
            if pattern.search(stripped):
                raise SanitizationError("Use of restricted modules or patterns is not allowed")
        return stripped

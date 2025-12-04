export interface TestCase {
  id: number
  input_data: string
  expected_output: string
  is_hidden: boolean
}

export interface Problem {
  id: number
  title: string
  description: string
  example_input: string
  example_output: string
  test_cases: TestCase[]
}

export interface ProblemPayload {
  title: string
  description: string
  example_input: string
  example_output: string
  test_cases: Array<{
    input_data: string
    expected_output: string
    is_hidden: boolean
  }>
}

export interface ExecutionTestCaseResult {
  test_case_id: number
  is_hidden: boolean
  passed: boolean
  input_data: string | null
  expected_output: string | null
  actual_output: string | null
  stdout: string | null
  stderr: string | null
  error: string | null
  runtime_ms: number
}

export interface ExecutionSummary {
  status: string
  passed_count: number
  failed_count: number
}

export interface ExecutionResponse {
  submission_id: number
  summary: ExecutionSummary
  results: ExecutionTestCaseResult[]
}

export interface SubmissionTestCaseSnapshot {
  id: number
  input_data: string
  expected_output: string
  is_hidden: boolean
}

export interface SubmissionReviewInfo {
  status: string
  feedback?: string | null
}

export interface SubmissionItem {
  id: number
  problem_id: number
  problem_title: string
  submitter_name?: string | null
  submitted_at?: string | null
  review: SubmissionReviewInfo
  execution_summary: ExecutionSummary
  stdout?: string | null
  stderr?: string | null
  test_cases: SubmissionTestCaseSnapshot[]
  code: string
  problem_description_snapshot?: string | null
  example_input_snapshot?: string | null
  example_output_snapshot?: string | null
}

export interface SubmissionDetail extends SubmissionItem {
  current_problem: Problem
  current_test_cases: TestCase[]
}

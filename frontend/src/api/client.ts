import type {
  ExecutionResponse,
  Problem,
  ProblemPayload,
  SubmissionDetail,
  SubmissionItem,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function getProblems(): Promise<Problem[]> {
  return request<Problem[]>('/problems/')
}

export function createProblem(payload: ProblemPayload): Promise<Problem> {
  return request<Problem>('/problems/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateProblem(problemId: number, payload: ProblemPayload): Promise<Problem> {
  return request<Problem>(`/problems/${problemId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function runExecution(
  problemId: number,
  code: string,
  submitterName?: string | null,
): Promise<ExecutionResponse> {
  return request<ExecutionResponse>('/execute/', {
    method: 'POST',
    body: JSON.stringify({ problem_id: problemId, code, submitter_name: submitterName }),
  })
}

export function submitForReview(
  submissionId: number,
  notes?: string,
): Promise<SubmissionItem> {
  return request<SubmissionItem>(`/submissions/${submissionId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  })
}

export function getSubmissions(params?: {
  submitter_name?: string
  problem_id?: number | null
  status?: string | null
  search?: string | null
}): Promise<SubmissionItem[]> {
  const searchParams = new URLSearchParams()
  if (params?.submitter_name) {
    searchParams.set('submitter_name', params.submitter_name)
  }
  if (params?.problem_id) {
    searchParams.set('problem_id', String(params.problem_id))
  }
  if (params?.status) {
    searchParams.set('status', params.status)
  }
  if (params?.search) {
    searchParams.set('search', params.search)
  }
  const query = searchParams.toString()
  const path = query ? `/submissions/?${query}` : '/submissions/'
  return request<SubmissionItem[]>(path)
}

export function getSubmissionDetail(submissionId: number): Promise<SubmissionDetail> {
  return request<SubmissionDetail>(`/submissions/${submissionId}`)
}

export function rerunSubmission(
  submissionId: number,
  payload: { code_override?: string | null } = {},
): Promise<SubmissionItem> {
  return request<SubmissionItem>(`/submissions/${submissionId}/rerun`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function reviewSubmission(
  submissionId: number,
  payload: { status: string; feedback?: string | null },
): Promise<SubmissionItem> {
  return request<SubmissionItem>(`/submissions/${submissionId}/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

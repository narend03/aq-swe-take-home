import type { ExecutionResponse, Problem, ProblemPayload } from './types'

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

export function runExecution(problemId: number, code: string): Promise<ExecutionResponse> {
  return request<ExecutionResponse>('/execute/', {
    method: 'POST',
    body: JSON.stringify({ problem_id: problemId, code }),
  })
}

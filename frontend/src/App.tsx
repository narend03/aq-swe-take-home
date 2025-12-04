import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  createProblem,
  getProblems,
  getSubmissionDetail,
  getSubmissions,
  runExecution,
  rerunSubmission,
  reviewSubmission,
  submitForReview,
  updateProblem,
} from './api/client'
import type {
  ExecutionResponse,
  Problem,
  ProblemPayload,
  SubmissionItem,
} from './api/types'
import './App.css'

const draftStorageKey = 'aq-problem-draft'
const userStorageKey = 'aq-user-name'
const reviewerStorageKey = 'aq-reviewer-token'

interface EditableTestCase {
  localId: string
  input: string
  expected: string
  isHidden: boolean
}

interface ProblemFormState {
  id?: number
  title: string
  description: string
  exampleInput: string
  exampleOutput: string
  testCases: EditableTestCase[]
  code: string
}

const defaultCode = `# Use standard input and print your answer. Example:
values = list(map(int, input().split()))
print(sum(values))
`

function createBlankState(): ProblemFormState {
  return {
    title: '',
    description: '',
    exampleInput: '',
    exampleOutput: '',
    testCases: [createBlankTestCase()],
    code: defaultCode,
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).substring(2, 10)
}

function createBlankTestCase(): EditableTestCase {
  return { localId: generateId(), input: '', expected: '', isHidden: false }
}

function problemToFormState(problem: Problem): ProblemFormState {
  return {
    id: problem.id,
    title: problem.title,
    description: problem.description,
    exampleInput: problem.example_input,
    exampleOutput: problem.example_output,
    testCases: problem.test_cases.map((tc) => ({
      localId: `${tc.id}`,
      input: tc.input_data,
      expected: tc.expected_output,
      isHidden: tc.is_hidden,
    })),
    code: defaultCode,
  }
}

function stateToPayload(state: ProblemFormState): ProblemPayload {
  return {
    title: state.title,
    description: state.description,
    example_input: state.exampleInput,
    example_output: state.exampleOutput,
    test_cases: state.testCases
      .filter((tc) => tc.input.trim() && tc.expected.trim())
      .map((tc) => ({
        input_data: tc.input,
        expected_output: tc.expected,
        is_hidden: tc.isHidden,
      })),
  }
}

function formatDate(value?: string | null): string {
  if (!value) return 'Not submitted'
  return new Date(value).toLocaleString()
}

function App() {
  const problemsQuery = useQuery({ queryKey: ['problems'], queryFn: getProblems })

  const [formState, setFormState] = useState<ProblemFormState>(() => {
    const stored = localStorage.getItem(draftStorageKey)
    return stored ? (JSON.parse(stored) as ProblemFormState) : createBlankState()
  })
  const [selectedProblemId, setSelectedProblemId] = useState<number | null>(
    formState.id ?? null,
  )
  const [executionResult, setExecutionResult] = useState<ExecutionResponse | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [isAutosaving, setIsAutosaving] = useState(false)
  const [lastSubmissionId, setLastSubmissionId] = useState<number | null>(null)
  const [submissionFilter, setSubmissionFilter] = useState<number | 'all'>('all')
  const [reviewNotes, setReviewNotes] = useState('')

  const [userName, setUserName] = useState(() => localStorage.getItem(userStorageKey) ?? '')

  const submissionsQuery = useQuery({
    queryKey: ['submissions', userName, submissionFilter],
    queryFn: () =>
      getSubmissions({
        submitter_name: userName,
        problem_id: submissionFilter === 'all' ? undefined : submissionFilter,
      }),
    enabled: Boolean(userName),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = stateToPayload(formState)
      if (!payload.title || !payload.description || payload.test_cases.length === 0) {
        throw new Error('Please fill title, description, and at least one test case before saving.')
      }
      if (formState.id) {
        return updateProblem(formState.id, payload)
      }
      return createProblem(payload)
    },
    onSuccess: (problem) => {
      setFormState((prev) => ({ ...prev, id: problem.id }))
      setSelectedProblemId(problem.id)
      localStorage.removeItem(draftStorageKey)
      setStatusMessage('Saved!')
      problemsQuery.refetch()
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const runMutation = useMutation({
    mutationFn: ({ problemId, code }: { problemId: number; code: string }) =>
      runExecution(problemId, code, userName),
    onSuccess: (result) => {
      setExecutionResult(result)
      setLastSubmissionId(result.submission_id)
      setStatusMessage('Tests completed.')
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!lastSubmissionId) {
        throw new Error('Run tests before submitting for review.')
      }
      const response = await submitForReview(lastSubmissionId, reviewNotes || undefined)
      return response
    },
    onSuccess: () => {
      setStatusMessage('Submitted for review!')
      setReviewNotes('')
      submissionsQuery.refetch()
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  useEffect(() => {
    if (!formState.id) {
      setIsAutosaving(true)
      const timer = setTimeout(() => {
        localStorage.setItem(draftStorageKey, JSON.stringify(formState))
        setIsAutosaving(false)
      }, 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [formState])

  useEffect(() => {
    localStorage.setItem(userStorageKey, userName)
  }, [userName])

  const selectedProblem = useMemo(
    () => problemsQuery.data?.find((problem) => problem.id === selectedProblemId) ?? null,
    [problemsQuery.data, selectedProblemId],
  )

  const handleSelectProblem = (problem: Problem) => {
    setExecutionResult(null)
    setLastSubmissionId(null)
    setFormState(problemToFormState(problem))
    setSelectedProblemId(problem.id)
    localStorage.removeItem(draftStorageKey)
  }

  const startNewProblem = () => {
    const stored = localStorage.getItem(draftStorageKey)
    const draft = stored ? (JSON.parse(stored) as ProblemFormState) : createBlankState()
    setFormState({ ...createBlankState(), ...draft, id: undefined })
    setSelectedProblemId(null)
    setExecutionResult(null)
    setLastSubmissionId(null)
  }

  const updateTestCase = (localId: string, patch: Partial<EditableTestCase>) => {
    setFormState((prev) => ({
      ...prev,
      testCases: prev.testCases.map((tc) => (tc.localId === localId ? { ...tc, ...patch } : tc)),
    }))
  }

  const removeTestCase = (localId: string) => {
    setFormState((prev) => ({
      ...prev,
      testCases: prev.testCases.filter((tc) => tc.localId !== localId),
    }))
  }

  const ensureProblemSaved = async () => {
    if (!formState.id) {
      await saveMutation.mutateAsync()
    } else if (saveMutation.isError) {
      throw new Error('Fix save errors before running tests.')
    }
  }

  const handleRunTests = async () => {
    try {
      if (!userName.trim()) {
        throw new Error('Enter your name or handle before running tests.')
      }
      await ensureProblemSaved()
      if (!formState.id) {
        throw new Error('Save the problem before running tests.')
      }
      await runMutation.mutateAsync({ problemId: formState.id, code: formState.code })
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Run failed')
    }
  }

  const handleSubmitForReview = async () => {
    try {
      await submitMutation.mutateAsync()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Submit failed')
    }
  }

  const submissionFilterOptions = useMemo(() => {
    const options = problemsQuery.data?.map((problem) => ({ value: problem.id, label: problem.title })) ?? []
    return [{ value: 'all' as const, label: 'All problems' }, ...options]
  }, [problemsQuery.data])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Problems</h1>
          <button className="primary" onClick={startNewProblem}>
            + New
          </button>
        </div>
        {problemsQuery.isLoading && <p className="muted">Loading…</p>}
        {problemsQuery.isError && <p className="error">Unable to load problems.</p>}
        <ul className="problem-list">
          {problemsQuery.data?.map((problem) => (
            <li key={problem.id}>
              <button
                className={clsx('problem-item', {
                  active: selectedProblemId === problem.id,
                })}
                onClick={() => handleSelectProblem(problem)}
              >
                <span>{problem.title}</span>
                <small>{problem.test_cases.length} tests</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="editor">
        <header className="editor-header">
          <div>
            <h2>{selectedProblem ? `Editing: ${selectedProblem.title}` : 'New Problem'}</h2>
            <p className="muted">
              {isAutosaving && !formState.id ? 'Autosaving draft…' : statusMessage}
            </p>
          </div>
          <div className="user-identity">
            <label>
              Your name / handle
              <input
                placeholder="e.g. jane@example.com"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
              />
            </label>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {formState.id ? 'Update Problem' : 'Save Problem'}
            </button>
            <button className="primary" onClick={handleRunTests} disabled={runMutation.isPending}>
              {runMutation.isPending ? 'Running…' : 'Run Tests'}
            </button>
          </div>
        </header>

        <div className="form-grid">
          <section>
            <label>
              Title
              <input
                value={formState.title}
                onChange={(event) => setFormState({ ...formState, title: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                value={formState.description}
                onChange={(event) => setFormState({ ...formState, description: event.target.value })}
              />
            </label>
            <div className="two-col">
              <label>
                Example Input
                <textarea
                  rows={2}
                  value={formState.exampleInput}
                  onChange={(event) =>
                    setFormState({ ...formState, exampleInput: event.target.value })
                  }
                />
              </label>
              <label>
                Example Output
                <textarea
                  rows={2}
                  value={formState.exampleOutput}
                  onChange={(event) =>
                    setFormState({ ...formState, exampleOutput: event.target.value })
                  }
                />
              </label>
            </div>
          </section>

          <section className="testcases">
            <div className="section-header">
              <h3>Test Cases</h3>
              <button
                className="secondary"
                onClick={() =>
                  setFormState({
                    ...formState,
                    testCases: [...formState.testCases, createBlankTestCase()],
                  })
                }
              >
                + Add Case
              </button>
            </div>
            {formState.testCases.length === 0 && (
              <p className="muted">Add at least one test case.</p>
            )}
            {formState.testCases.map((testCase, index) => (
              <div key={testCase.localId} className="testcase-card">
                <div className="testcase-header">
                  <strong>Case {index + 1}</strong>
                  {formState.testCases.length > 1 && (
                    <button className="link" onClick={() => removeTestCase(testCase.localId)}>
                      Remove
                    </button>
                  )}
                </div>
                <label>
                  Input
                  <textarea
                    rows={2}
                    value={testCase.input}
                    onChange={(event) => updateTestCase(testCase.localId, { input: event.target.value })}
                  />
                </label>
                <label>
                  Expected Output
                  <textarea
                    rows={2}
                    value={testCase.expected}
                    onChange={(event) =>
                      updateTestCase(testCase.localId, { expected: event.target.value })
                    }
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={testCase.isHidden}
                    onChange={(event) =>
                      updateTestCase(testCase.localId, { isHidden: event.target.checked })
                    }
                  />
                  Hidden test
                </label>
              </div>
            ))}
          </section>
        </div>

        <section className="code-editor">
          <div className="section-header">
            <h3>Solution Code</h3>
          </div>
          <Editor
            height="240px"
            defaultLanguage="python"
            theme="vs-light"
            value={formState.code}
            onChange={(value) => setFormState({ ...formState, code: value ?? '' })}
            options={{ minimap: { enabled: false }, fontSize: 14 }}
          />
        </section>

        <section className="results">
          <div className="section-header">
            <h3>Test Results</h3>
            <div className="review-actions">
              <textarea
                rows={2}
                placeholder="Notes for reviewer (optional)"
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
              />
              <button
                className="primary"
                onClick={handleSubmitForReview}
                disabled={!lastSubmissionId || submitMutation.isPending}
              >
                {submitMutation.isPending ? 'Submitting…' : 'Submit for Review'}
              </button>
            </div>
          </div>
          {!executionResult && <p className="muted">Run tests to see results.</p>}
          {executionResult && (
            <div>
              <p className="muted">
                Status: <strong>{executionResult.summary.status}</strong> · Passed {executionResult.summary.passed_count} / {executionResult.summary.passed_count + executionResult.summary.failed_count}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Visibility</th>
                    <th>Status</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {executionResult.results.map((result, index) => (
                    <tr key={result.test_case_id}>
                      <td>{index + 1}</td>
                      <td>{result.is_hidden ? 'Hidden' : 'Public'}</td>
                      <td className={result.passed ? 'passed' : 'failed'}>
                        {result.passed ? 'Passed' : 'Failed'}
                      </td>
                      <td>{result.expected_output ?? '—'}</td>
                      <td>{result.actual_output ?? '—'}</td>
                      <td>{result.error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="submissions">
          <div className="section-header">
            <h3>My Submissions</h3>
            <select
              value={submissionFilter}
              onChange={(event) =>
                setSubmissionFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
              }
            >
              {submissionFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {!userName && <p className="muted">Enter your name to see your submission history.</p>}
          {userName && submissionsQuery.isLoading && <p className="muted">Loading submissions…</p>}
          {userName && submissionsQuery.isError && (
            <p className="error">Unable to load submissions.</p>
          )}
          {userName && submissionsQuery.data && submissionsQuery.data.length === 0 && (
            <p className="muted">No submissions yet.</p>
          )}
          {userName && submissionsQuery.data && submissionsQuery.data.length > 0 && (
            <div className="submission-cards">
              {submissionsQuery.data.map((submission) => (
                <SubmissionCard
                  key={submission.id}
                  submission={submission}
                  problemTitle={submission.problem_title}
                />
              ))}
            </div>
          )}
        </section>
        <ReviewerWorkspace refreshUserSubmissions={() => submissionsQuery.refetch()} />
      </main>
    </div>
  )
}

function SubmissionCard({ submission, problemTitle }: { submission: SubmissionItem; problemTitle: string }) {
  return (
    <div className="submission-card">
      <div className="submission-card__header">
        <div>
          <h4>{problemTitle}</h4>
          <small className="muted">Submitted {formatDate(submission.submitted_at)}</small>
        </div>
        <span className={clsx('chip', submission.review.status)}>{submission.review.status}</span>
      </div>
      <p className="muted">
        Review note: {submission.review.feedback ? submission.review.feedback : 'Awaiting reviewer feedback.'}
      </p>
      <p>
        Result: {submission.execution_summary.status} · Passed {submission.execution_summary.passed_count} /{' '}
        {submission.execution_summary.passed_count + submission.execution_summary.failed_count}
      </p>
      <details>
        <summary>Snapshot & logs</summary>
        <div className="snapshot">
          <h5>Test Cases</h5>
          <ul>
            {submission.test_cases.map((tc) => (
              <li key={tc.id}>
                <strong>{tc.is_hidden ? 'Hidden' : 'Public'}:</strong> expected "{tc.expected_output}" for input "
                {tc.input_data}"
              </li>
            ))}
          </ul>
          <h5>Stdout</h5>
          <pre>{submission.stdout ?? '—'}</pre>
          <h5>Stderr</h5>
          <pre>{submission.stderr ?? '—'}</pre>
        </div>
      </details>
    </div>
  )
}

function ReviewerWorkspace({ refreshUserSubmissions }: { refreshUserSubmissions: () => void }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState(() => localStorage.getItem(reviewerStorageKey) ?? '')
  const [reviewerMode, setReviewerMode] = useState(() => Boolean(localStorage.getItem(reviewerStorageKey)))
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null)
  const [codeOverride, setCodeOverride] = useState('')
  const [feedback, setFeedback] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (reviewerMode && token.trim()) {
      localStorage.setItem(reviewerStorageKey, token.trim())
    } else if (!reviewerMode) {
      localStorage.removeItem(reviewerStorageKey)
      setSelectedSubmissionId(null)
    }
  }, [reviewerMode, token])

  const adminSubmissionsQuery = useQuery({
    queryKey: ['admin-submissions', reviewerMode, statusFilter, search],
    queryFn: () =>
      getSubmissions({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search.trim() || undefined,
      }),
    enabled: reviewerMode,
  })

  const submissionDetailQuery = useQuery({
    queryKey: ['submission-detail', selectedSubmissionId],
    queryFn: () => getSubmissionDetail(selectedSubmissionId!),
    enabled: reviewerMode && Boolean(selectedSubmissionId),
  })

  const rerunMutation = useMutation({
    mutationFn: ({ submissionId, codeOverride }: { submissionId: number; codeOverride?: string }) =>
      rerunSubmission(submissionId, { code_override: codeOverride || undefined }),
    onSuccess: (_, variables) => {
      setMessage('Rerun completed.')
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['submission-detail', variables.submissionId] })
      refreshUserSubmissions()
    },
    onError: (error: Error) => {
      setMessage(error.message)
    },
  })

  const reviewMutation = useMutation({
    mutationFn: ({
      submissionId,
      status,
      feedback,
    }: {
      submissionId: number
      status: 'approved' | 'rejected'
      feedback?: string
    }) => reviewSubmission(submissionId, { status, feedback }),
    onSuccess: (_, variables) => {
      setMessage(`Submission ${variables.status}.`)
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['submission-detail', variables.submissionId] })
      refreshUserSubmissions()
    },
    onError: (error: Error) => {
      setMessage(error.message)
    },
  })

  const toggleReviewerMode = () => {
    if (reviewerMode) {
      setReviewerMode(false)
      setToken('')
      setMessage('')
    } else if (token.trim()) {
      setReviewerMode(true)
      setMessage('')
    } else {
      setMessage('Enter reviewer token first.')
    }
  }

  const handleSelectSubmission = (submissionId: number) => {
    setSelectedSubmissionId(submissionId)
    setCodeOverride('')
    setFeedback('')
    setMessage('')
  }

  const handleRerun = () => {
    if (!selectedSubmissionId) return
    rerunMutation.mutate({ submissionId: selectedSubmissionId, codeOverride: codeOverride || undefined })
  }

  const handleReview = (status: 'approved' | 'rejected') => {
    if (!selectedSubmissionId) return
    reviewMutation.mutate({ submissionId: selectedSubmissionId, status, feedback: feedback || undefined })
  }

  const detail = submissionDetailQuery.data

  return (
    <section className="reviewer">
      <div className="section-header">
        <h3>Reviewer Workspace</h3>
        <div className="reviewer-controls">
          <input
            placeholder="Reviewer token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <button className="secondary" onClick={toggleReviewerMode}>
            {reviewerMode ? 'Exit Reviewer Mode' : 'Enter Reviewer Mode'}
          </button>
        </div>
      </div>
      {message && <p className="muted">{message}</p>}
      {reviewerMode && (
        <div className="reviewer-panels">
          <div className="admin-list">
            <div className="filter-row">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All statuses</option>
              </select>
              <input
                placeholder="Search by user or problem"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {adminSubmissionsQuery.isLoading && <p className="muted">Loading submissions…</p>}
            {adminSubmissionsQuery.isError && <p className="error">Unable to load submissions.</p>}
            {adminSubmissionsQuery.data?.length === 0 && <p className="muted">No submissions found.</p>}
            <ul>
              {adminSubmissionsQuery.data?.map((submission) => (
                <li key={submission.id}>
                  <button
                    className={clsx('problem-item', {
                      active: submission.id === selectedSubmissionId,
                    })}
                    onClick={() => handleSelectSubmission(submission.id)}
                  >
                    <span>
                      {submission.problem_title} — {submission.submitter_name ?? 'unknown'}
                    </span>
                    <small>{submission.review.status}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="admin-detail">
            {!selectedSubmissionId && <p className="muted">Select a submission to review.</p>}
            {selectedSubmissionId && detail && (
              <div>
                <h4>{detail.problem_title}</h4>
                <p className="muted">Submitted by {detail.submitter_name ?? 'unknown'} on {formatDate(detail.submitted_at)}</p>
                <h5>Snapshot Description</h5>
                <p>{detail.problem_description_snapshot}</p>
                <h5>Stored Test Cases</h5>
                <ul>
                  {detail.test_cases.map((tc) => (
                    <li key={tc.id}>
                      <strong>{tc.is_hidden ? 'Hidden' : 'Public'}:</strong> expected "{tc.expected_output}" for "{tc.input_data}"
                    </li>
                  ))}
                </ul>
                <h5>Current Problem</h5>
                <ul>
                  {detail.current_test_cases.map((tc) => (
                    <li key={tc.id}>
                      <strong>{tc.is_hidden ? 'Hidden' : 'Public'}:</strong> expected "{tc.expected_output}" for "{tc.input_data}"
                    </li>
                  ))}
                </ul>
                <h5>User Code</h5>
                <pre className="code-block">{detail.code}</pre>
                <div className="reviewer-actions">
                  <textarea
                    rows={3}
                    placeholder="Override code before rerun (optional)"
                    value={codeOverride}
                    onChange={(event) => setCodeOverride(event.target.value)}
                  />
                  <button className="secondary" onClick={handleRerun} disabled={rerunMutation.isPending}>
                    {rerunMutation.isPending ? 'Rerunning…' : 'Rerun Tests'}
                  </button>
                </div>
                <div className="reviewer-actions">
                  <textarea
                    rows={3}
                    placeholder="Reviewer feedback"
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                  />
                  <div className="review-buttons">
                    <button className="primary" onClick={() => handleReview('approved')} disabled={reviewMutation.isPending}>
                      Approve
                    </button>
                    <button className="secondary" onClick={() => handleReview('rejected')} disabled={reviewMutation.isPending}>
                      Reject
                    </button>
                  </div>
                </div>
                <div className="log-block">
                  <h5>Latest stdout</h5>
                  <pre>{detail.stdout ?? '—'}</pre>
                  <h5>Latest stderr</h5>
                  <pre>{detail.stderr ?? '—'}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default App

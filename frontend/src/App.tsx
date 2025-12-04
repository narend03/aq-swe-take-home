import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  createProblem,
  getProblems,
  runExecution,
  updateProblem,
} from './api/client'
import type { ExecutionResponse, Problem, ProblemPayload } from './api/types'
import './App.css'

const draftStorageKey = 'aq-problem-draft'

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = stateToPayload(formState)
      if (!payload.title || !payload.description || payload.test_cases.length === 0) {
        throw new Error('Please fill title, description, and at least one test case before saving.')
      }
      if (formState.id) {
        const updated = await updateProblem(formState.id, payload)
        return updated
      }
      const created = await createProblem(payload)
      return created
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
      runExecution(problemId, code),
    onSuccess: (result) => {
      setExecutionResult(result)
      setStatusMessage('Tests completed.')
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

  const selectedProblem = useMemo(
    () => problemsQuery.data?.find((problem) => problem.id === selectedProblemId) ?? null,
    [problemsQuery.data, selectedProblemId],
  )

  const handleSelectProblem = (problem: Problem) => {
    setExecutionResult(null)
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
    } else if (saveMutation.isIdle === false && saveMutation.isError) {
      throw new Error('Fix save errors before running tests.')
    }
  }

  const handleRunTests = async () => {
    try {
      await ensureProblemSaved()
      if (!formState.id) {
        throw new Error('Save the problem before running tests.')
      }
      await runMutation.mutateAsync({ problemId: formState.id, code: formState.code })
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Run failed')
    }
  }

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
              <button className="secondary" onClick={() => setFormState({
                ...formState,
                testCases: [...formState.testCases, createBlankTestCase()],
              })}>
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
      </main>
    </div>
  )
}

export default App

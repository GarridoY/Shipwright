'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Run = { id: string; attempt: number; status: string; runtime: string; agentDefinitionId: string; createdAt: string };
type Task = { id: string; title: string; objective: string; acceptanceCriteria: string[]; status: string; runtime: string; agentDefinitionId: string; runs: Run[] };

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/tasks/${encodeURIComponent(id)}`);
      const body = await response.json() as Task | { error: string };
      if (!response.ok) throw new Error('error' in body ? body.error : 'Unable to load task');
      setTask(body as Task);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load task');
    }
  }, [apiUrl, id]);

  useEffect(() => { void load(); }, [load]);

  async function startRun() {
    setStarting(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/tasks/${encodeURIComponent(id)}/runs`, { method: 'POST' });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to start run');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start run');
    } finally {
      setStarting(false);
    }
  }

  return <main>
    <p><a href="/">Projects</a></p>
    <h1>Task</h1>
    {error && <p role="alert">{error}</p>}
    {!task && !error && <p>Loading task…</p>}
    {task && <>
      <h2>{task.title}</h2>
      <p>{task.objective}</p>
      <p>Status: {task.status}</p>
      <h3>Acceptance criteria</h3>
      <ul>{task.acceptanceCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
      <p>Definition: {task.agentDefinitionId}; runtime: {task.runtime}</p>
      <button type="button" onClick={startRun} disabled={starting}>{starting ? 'Starting…' : 'Start run'}</button>
      <h3>Run attempts</h3>
      {task.runs.length === 0 ? <p>No run attempts yet.</p> : <ol>{task.runs.map((run) => <li key={run.id}>
        Attempt {run.attempt}: {run.status} — {run.runtime} ({run.id})
      </li>)}</ol>}
    </>}
  </main>;
}

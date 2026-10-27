'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Run = { id: string; attempt: number; status: string; runtime: string; agentDefinitionId: string; createdAt: string };
type Task = { id: string; title: string; objective: string; acceptanceCriteria: string[]; status: string; runtime: string | null; agentDefinitionId: string | null; runs: Run[] };

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (/approval|input|review|attention|validation/.test(normalized)) return 'tone-attention';
  if (/failed|cancelled|blocked/.test(normalized)) return 'tone-blocked';
  if (/completed|done/.test(normalized)) return 'tone-done';
  if (/running|in.progress|in_progress/.test(normalized)) return 'tone-running';
  if (/ready/.test(normalized)) return 'tone-ready';
  return 'tone-neutral';
}

function displayStatus(status: string) {
  return status.replace(/[_-]/g, ' ');
}

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

  return <div className="app-shell">
    <aside className="app-sidebar">
      <a className="app-brand" href="/"><span className="app-brand-mark">S</span><span className="app-brand-copy">shipwright<small>LOCAL WORKSPACE</small></span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Workspace navigation"><a href="/"><span className="nav-glyph">◫</span> Overview</a><a href="/#projects"><span className="nav-glyph">▤</span> Projects</a><a href="/#agents"><span className="nav-glyph">◈</span> Agents</a></nav>
      <div className="sidebar-divider"></div>
      <div className="sidebar-label">TASK</div>
      {task && <div className="sidebar-projects"><a href="#task-details"><span className="project-monogram">{task.title.slice(0, 1).toUpperCase()}</span><span title={task.title}>{task.title}</span></a></div>}
      <div className="sidebar-bottom"><span className="user-avatar">D</span><span className="sidebar-user-copy">Developer<small>Local workspace</small></span></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="topbar-crumb"><a href="/">Workspace</a><span className="topbar-slash">/</span><strong>Task detail</strong></div><a className="back-link" href="/">← All projects</a></header>
      <main className="workspace task-workspace" id="task-details">
        {error && <p className="notice" role="alert">{error}</p>}
        {!task && !error && <div className="panel empty-state"><strong>Loading task…</strong>Getting the latest task and run details.</div>}
        {task && <>
          <div className="page-heading task-title-row"><div><span className="eyebrow">TASK / {task.id.slice(0, 8).toUpperCase()}</span><h1>{task.title}</h1><p className="task-objective">{task.objective}</p></div><span className={`task-status ${statusTone(task.status)}`}><i></i>{displayStatus(task.status)}</span></div>
          <div className="task-meta-grid"><div className="meta-card"><span>Agent definition</span><strong>{task.agentDefinitionId ?? 'Not assigned'}</strong></div><div className="meta-card"><span>Runtime</span><strong>{task.runtime ?? 'Not configured'}</strong></div></div>
          {!task.agentDefinitionId && <p className="notice" role="status">This legacy task has no agent definition. Create a new task with an agent definition before starting a run.</p>}
          <section className="panel task-panel" aria-labelledby="criteria-heading"><div className="panel-heading"><div><h2 id="criteria-heading">Acceptance criteria</h2><p>{task.acceptanceCriteria.length} item{task.acceptanceCriteria.length === 1 ? '' : 's'} to validate</p></div></div>{task.acceptanceCriteria.length === 0 ? <div className="empty-state">No acceptance criteria were provided for this task.</div> : <ul className="criteria-list">{task.acceptanceCriteria.map((criterion, index) => <li key={`${index}-${criterion}`}>{criterion}</li>)}</ul>}</section>
          <section className="panel task-panel" aria-labelledby="runs-heading"><div className="panel-heading"><div><h2 id="runs-heading">Run attempts</h2><p>Task status and execution attempts are tracked separately.</p></div><span className="overview-card-label">{task.runs.length} attempt{task.runs.length === 1 ? '' : 's'}</span></div>
            {task.runs.length === 0 ? <div className="empty-state"><strong>No run attempts yet</strong>Start a run when you’re ready to put this task in motion.</div> : <div className="run-list">{task.runs.map((run) => <article className="run-row" key={run.id}><span className="run-index">{String(run.attempt).padStart(2, '0')}</span><span className="run-copy"><strong>Attempt {run.attempt}</strong><small>{run.runtime} · {run.agentDefinitionId}</small></span><span className={`task-status ${statusTone(run.status)}`}><i></i>{displayStatus(run.status)}</span></article>)}</div>}
            <div className="run-action"><p>{task.runtime ? `Ready to start a ${task.runtime} run for this task.` : 'A configured agent definition and runtime are required to start a run.'}</p><button className="primary-button" type="button" onClick={startRun} disabled={starting || !task.agentDefinitionId || !task.runtime}>{starting ? 'Starting…' : 'Start run'} <span aria-hidden="true">↗</span></button></div>
          </section>
        </>}
        <footer className="app-footer"><span>Shipwright <b>·</b> Thoughtful work, with you in control</span><span className="app-footer-status"><i></i> Everything stays local</span></footer>
      </main>
    </div>
  </div>;
}

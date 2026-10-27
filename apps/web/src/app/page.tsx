'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse } from '@shipwright/contracts';

type HealthState =
  { kind: 'loading' } | { kind: 'ready'; health: HealthResponse } | { kind: 'failed' };
type Project = { id: string; name: string; repositoryPath: string; currentBranch: string | null };
type AgentDefinition = { id: string; name: string; version: number; runtime: string };
type Runtime = { id: string; capabilities: string[] };
type DashboardTask = { id: string; title: string; projectId: string; status: string; runtime: string | null; agentDefinitionId: string | null; updatedAt: string; runs: { id: string; attempt: number; status: string; runtime: string }[] };

function taskState(task: DashboardTask) {
  const latestRun = task.runs[0];
  const activeRun = task.runs.find((run) => ['queued', 'starting', 'running', 'waiting_approval', 'waiting_input'].includes(run.status));
  const state = activeRun?.status ?? (latestRun?.status === 'failed' ? 'failed' : task.status);
  if (state === 'waiting_approval') return { label: 'Needs approval', tone: 'attention' };
  if (state === 'waiting_input') return { label: 'Needs your input', tone: 'attention' };
  if (state === 'running' || state === 'starting' || state === 'in_progress') return { label: 'Agent working', tone: 'running' };
  if (state === 'queued') return { label: 'Queued', tone: 'ready' };
  if (state === 'review') return { label: 'Ready for review', tone: 'attention' };
  if (state === 'blocked') return { label: 'Blocked', tone: 'blocked' };
  if (state === 'done' || state === 'completed') return { label: 'Complete', tone: 'done' };
  if (state === 'failed') return { label: 'Run failed', tone: 'blocked' };
  return { label: state.replace(/[_-]/g, ' '), tone: state === 'ready' ? 'ready' : 'neutral' };
}

export default function Home() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([]);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [projectError, setProjectError] = useState('');
  const [taskLoadError, setTaskLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

  useEffect(() => {
    fetch(`${apiUrl}/health`)
      .then(async (response) => {
        const body: HealthResponse = await response.json();
        if (!response.ok) throw new Error('API health check failed');
        setHealth({ kind: 'ready', health: body });
      })
      .catch(() => setHealth({ kind: 'failed' }));
    fetch(`${apiUrl}/api/projects`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Project request failed');
        setProjects(await response.json() as Project[]);
      })
      .catch(() => setProjectError('Unable to load projects.'));
    fetch(`${apiUrl}/api/tasks`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Task request failed');
        setTasks(await response.json() as DashboardTask[]);
      })
      .catch(() => setTaskLoadError('Unable to load task activity.'))
      .finally(() => setTasksLoaded(true));
    fetch(`${apiUrl}/api/agent-definitions`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Agent definition request failed');
        setDefinitions(await response.json() as AgentDefinition[]);
      })
      .catch(() => setProjectError('Unable to load agent definitions.'));
    fetch(`${apiUrl}/api/runtimes`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Runtime request failed');
        setRuntimes(await response.json() as Runtime[]);
      })
      .catch(() => setProjectError('Unable to load runtimes.'));
  }, []);

  async function registerProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setProjectError('');
    const form = new FormData(formElement);
    try {
      const response = await fetch(`${apiUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), repositoryPath: form.get('repositoryPath') }),
      });
      const body = await response.json() as Project | { error: string };
      if (!response.ok) throw new Error('error' in body ? body.error : 'Unable to register project');
      setProjects((current) => [...current.filter((project) => project.id !== (body as Project).id), body as Project]);
      formElement.reset();
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : 'Unable to register project');
    } finally {
      setSaving(false);
    }
  }

  async function createDefinition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setProjectError('');
    try {
      const response = await fetch(`${apiUrl}/api/agent-definitions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.get('definitionName'), runtime: form.get('definitionRuntime') }),
      });
      const body = await response.json() as AgentDefinition | { error: string };
      if (!response.ok) throw new Error('error' in body ? body.error : 'Unable to create definition');
      setDefinitions((current) => [...current, body as AgentDefinition]);
      formElement.reset();
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : 'Unable to create definition');
    } finally {
      setSaving(false);
    }
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setProjectError('');
    try {
      const response = await fetch(`${apiUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: form.get('projectId'), title: form.get('title'), objective: form.get('objective'),
          acceptanceCriteria: String(form.get('acceptanceCriteria')).split('\n').map((item) => item.trim()).filter(Boolean),
          agentDefinitionId: form.get('agentDefinitionId'),
        }),
      });
      const body = await response.json() as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? 'Unable to create task');
      window.location.assign(`/tasks/${encodeURIComponent(body.id)}`);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : 'Unable to create task');
    } finally {
      setSaving(false);
    }
  }

  const serviceStatus = health.kind === 'ready' ? 'ready' : health.kind === 'failed' ? 'error' : 'loading';
  const needsAttention = tasks.filter((task) => taskState(task).tone === 'attention' || taskState(task).tone === 'blocked').length;
  const activeRuns = tasks.filter((task) => task.runs.some((run) => ['queued', 'starting', 'running', 'waiting_approval', 'waiting_input'].includes(run.status))).length;

  return <div className="app-shell">
    <aside className="app-sidebar">
      <a className="app-brand" href="#overview"><span className="app-brand-mark">S</span><span className="app-brand-copy">shipwright<small>LOCAL WORKSPACE</small></span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        <a href="#overview" aria-current="page"><span className="nav-glyph">◫</span> Overview</a>
        <a href="#projects"><span className="nav-glyph">▤</span> Projects <span className="nav-count">{projects.length}</span></a>
        <a href="#agents"><span className="nav-glyph">◈</span> Agents <span className="nav-count">{definitions.length}</span></a>
      </nav>
      <div className="sidebar-divider"></div>
      <div className="sidebar-label">YOUR PROJECTS</div>
      <div className="sidebar-projects">{projects.map((project) => <a href={`#project-${project.id}`} key={project.id}><span className="project-monogram">{project.name.slice(0, 1).toUpperCase()}</span>{project.name}</a>)}</div>
      <div className="sidebar-bottom"><span className="user-avatar">D</span><span className="sidebar-user-copy">Developer<small>Local workspace</small></span></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="topbar-crumb">Workspace <span className="topbar-slash">/</span><strong>Overview</strong></div>
        <div className={`topbar-status ${serviceStatus === 'error' ? 'topbar-status--error' : serviceStatus === 'loading' ? 'topbar-status--loading' : ''}`} role="status">
          <i></i>{health.kind === 'loading' && 'Connecting to local services…'}{health.kind === 'failed' && 'API unavailable — start local services'}{health.kind === 'ready' && `API ${health.health.status} · database ${health.health.database}`}
        </div>
      </header>
      <main className="workspace" id="overview">
        <div className="page-heading"><div><span className="eyebrow">YOUR LOCAL SOFTWARE FACTORY</span><h1>Welcome to Shipwright</h1><p>Create focused tasks, assign an agent, and keep every run under your control.</p></div><a className="primary-button" href="#new-project"><span aria-hidden="true">＋</span> Add project</a></div>
        {projectError && <p className="notice" role="alert">{projectError}</p>}
        <section className="overview-grid" aria-label="Workspace summary">
          <div className="overview-card"><span className="overview-card-label">Active runs <span className="summary-mark summary-mark--running">●</span></span><strong>{taskLoadError ? '—' : activeRuns.toString().padStart(2, '0')}</strong><small>{taskLoadError ? 'Task activity unavailable' : activeRuns === 0 ? 'No agents are running right now' : 'Agents currently working'}</small></div>
          <div className={`overview-card ${needsAttention > 0 ? 'overview-card--attention' : ''}`}><span className="overview-card-label">Needs your attention <span className="summary-mark summary-mark--attention">●</span></span><strong>{taskLoadError ? '—' : needsAttention.toString().padStart(2, '0')}</strong><small>{taskLoadError ? 'Task activity unavailable' : needsAttention === 0 ? 'Nothing waiting on you' : `${needsAttention} item${needsAttention === 1 ? '' : 's'} need a decision`}</small></div>
          <div className="overview-card"><span className="overview-card-label">Projects <span>↗</span></span><strong>{projects.length.toString().padStart(2, '0')}</strong><small>{projects.length === 1 ? 'One workspace ready' : `${definitions.length} agent definitions configured`}</small></div>
        </section>

        <div className="section-heading"><div><h2>Recent tasks</h2><p>Agent activity and decisions that need your attention.</p></div></div>
        <section className="panel dashboard-tasks" aria-label="Recent tasks">
          {taskLoadError ? <div className="empty-state" role="alert"><strong>Task activity unavailable</strong>{taskLoadError}</div> : !tasksLoaded ? <div className="empty-state">Loading your task activity…</div> : tasks.length === 0 ? <div className="empty-state"><strong>No tasks yet</strong>Create a task from one of your projects below. When agents are running or waiting on you, you’ll see it here.</div> : tasks.slice(0, 8).map((task) => {
            const state = taskState(task);
            const project = projects.find((item) => item.id === task.projectId);
            const definition = definitions.find((item) => item.id === task.agentDefinitionId);
            return <a className="dashboard-task-row" href={`/tasks/${encodeURIComponent(task.id)}`} key={task.id}>
              <span className={`task-row-symbol tone-${state.tone}`}>{state.tone === 'running' ? '◌' : state.tone === 'attention' ? '!' : state.tone === 'blocked' ? '×' : state.tone === 'done' ? '✓' : '◇'}</span>
              <span className="dashboard-task-copy"><strong>{task.title}</strong><small>{project?.name ?? 'Project'} <i>·</i> {definition?.name ?? task.runtime ?? 'Unassigned agent'}</small></span>
              <span className={`task-status tone-${state.tone}`}><i></i>{state.label}</span>
              <span className="dashboard-task-time">{new Date(task.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className="task-row-arrow" aria-hidden="true">↗</span>
            </a>;
          })}
        </section>

        <div className="section-heading" id="projects"><div><h2>Projects</h2><p>Choose a project to shape its next task.</p></div></div>
        <div className="section-grid">
          <section className="project-list" aria-label="Registered projects">
            {projects.length === 0 ? <div className="panel empty-state"><strong>No projects yet</strong>Register a local repository to start organizing agent work.</div> : projects.map((project) => <article className="project-card" id={`project-${project.id}`} key={project.id}>
              <div className="project-card-heading"><span className="project-card-icon">{project.name.slice(0, 1).toUpperCase()}</span><div><h3>{project.name}</h3><p title={project.repositoryPath}>{project.repositoryPath}</p></div><span className="branch-chip">⌘ {project.currentBranch ?? 'detached'}</span></div>
              <form onSubmit={createTask} className="form-grid">
                <input type="hidden" name="projectId" value={project.id} />
                <label className="form-field form-field--wide">Task title<input name="title" required maxLength={200} placeholder="What needs to get done?" /></label>
                <label className="form-field form-field--wide">Objective<textarea name="objective" required maxLength={20000} placeholder="Describe the outcome you want the agent to achieve." /></label>
                <label className="form-field">Acceptance criteria<textarea name="acceptanceCriteria" required placeholder={'One criterion per line\nEach should be verifiable'} /></label>
                <label className="form-field">Agent definition<select name="agentDefinitionId" required defaultValue=""><option value="" disabled>Select an agent</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name} v{definition.version} · {definition.runtime}</option>)}</select></label>
                <div className="form-footer">{definitions.length === 0 && <p className="form-help">Create an agent definition to enable task creation.</p>}<button className="primary-button" type="submit" disabled={saving || definitions.length === 0}>{saving ? 'Creating…' : 'Create task'} <span aria-hidden="true">↗</span></button></div>
              </form>
            </article>)}
            <section className="panel" id="new-project">
              <div className="panel-heading"><div><h2>Register a project</h2><p>Add an allowed local repository to your workspace.</p></div></div>
              <form onSubmit={registerProject} className="inline-form">
                <label className="form-field">Project name<input name="name" required maxLength={200} placeholder="e.g. Website" /></label>
                <label className="form-field">Repository path<input name="repositoryPath" required placeholder="C:/work/my-project" /></label>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Registering…' : 'Register project'}</button>
              </form>
            </section>
          </section>
          <section className="panel agent-panel" id="agents" aria-labelledby="agents-heading">
            <div className="panel-heading"><div><h2 id="agents-heading">Agent definitions</h2><p>Configured recipes for your local runtimes.</p></div><span className="runtime-ready"><i></i>{runtimes.length} runtime{runtimes.length === 1 ? '' : 's'}</span></div>
            {definitions.length === 0 ? <div className="empty-state">No agent definitions yet. Create one below to start assigning tasks.</div> : <div className="agent-list">{definitions.map((definition) => <div className="agent-row" key={definition.id}><span className="agent-icon">✳</span><span className="agent-copy"><strong>{definition.name} v{definition.version}</strong><small>{definition.runtime}</small></span><span className="runtime-ready"><i></i> Available</span></div>)}</div>}
            <form onSubmit={createDefinition} className="inline-form">
              <label className="form-field">Definition name<input name="definitionName" required maxLength={200} placeholder="e.g. Feature builder" /></label>
              <label className="form-field">Runtime<select name="definitionRuntime" required defaultValue=""><option value="" disabled>Select a runtime</option>{runtimes.map((runtime) => <option key={runtime.id} value={runtime.id}>{runtime.id}</option>)}</select></label>
              <button className="primary-button" type="submit" disabled={saving || runtimes.length === 0}>{saving ? 'Creating…' : 'Create definition'}</button>
            </form>
          </section>
        </div>
        <footer className="app-footer"><span>Shipwright <b>·</b> Thoughtful work, with you in control</span><span className="app-footer-status"><i></i> Everything stays local</span></footer>
      </main>
    </div>
  </div>;
}

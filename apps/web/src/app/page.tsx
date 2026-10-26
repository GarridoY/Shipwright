'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse } from '@shipwright/contracts';

type HealthState =
  { kind: 'loading' } | { kind: 'ready'; health: HealthResponse } | { kind: 'failed' };
type Project = { id: string; name: string; repositoryPath: string; currentBranch: string | null };

export default function Home() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectError, setProjectError] = useState('');
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
          agentDefinitionId: form.get('agentDefinitionId'), runtime: form.get('runtime'),
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

  return (
    <main>
      <h1>Shipwright</h1>
      <p>Local-first software factory</p>
      <h2>Service status</h2>
      {health.kind === 'loading' && <p>Connecting to the API…</p>}
      {health.kind === 'failed' && (
        <p role="status">API unavailable. Start the local services and refresh.</p>
      )}
      {health.kind === 'ready' && (
        <p role="status">
          API {health.health.status}; database {health.health.database}.
        </p>
      )}
      <h2>Projects</h2>
      <form onSubmit={registerProject}>
        <label>Project name <input name="name" required maxLength={200} /></label>
        <label>Repository path <input name="repositoryPath" required /></label>
        <button type="submit" disabled={saving}>{saving ? 'Registering…' : 'Register project'}</button>
      </form>
      {projectError && <p role="alert">{projectError}</p>}
      {projects.length === 0 ? <p>No projects registered.</p> : (
        <ul>{projects.map((project) => <li key={project.id}>
          <strong>{project.name}</strong> — {project.repositoryPath} (branch: {project.currentBranch ?? 'detached'})
          <form onSubmit={createTask}>
            <input type="hidden" name="projectId" value={project.id} />
            <label>Task title <input name="title" required maxLength={200} /></label>
            <label>Objective <textarea name="objective" required maxLength={20000} /></label>
            <label>Acceptance criteria (one per line) <textarea name="acceptanceCriteria" required /></label>
            <label>Agent definition ID <input name="agentDefinitionId" required /></label>
            <label>Runtime <input name="runtime" required maxLength={100} /></label>
            <button type="submit" disabled={saving}>Create task</button>
          </form>
        </li>)}</ul>
      )}
    </main>
  );
}

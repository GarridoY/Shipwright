import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApi, type TaskRecord } from './app.js';
import { resolveApiHost, resolveProjectRoots } from './config.js';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
let root: string;
let repository: string;
const records = new Map<string, { id: string; name: string; repositoryPath: string; createdAt: Date; updatedAt: Date }>();

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'shipwright-projects-'));
  repository = path.join(root, 'repo');
  await mkdir(repository);
  execFileSync('git', ['init', repository], { stdio: 'ignore' });
  records.clear();
});

describe('resolveApiHost', () => {
  it.each([
    [undefined, '127.0.0.1'],
    ['127.0.0.1', '127.0.0.1'],
    ['127.0.0.2', '127.0.0.2'],
    ['localhost', '127.0.0.1'],
    ['::1', '::1'],
  ])('accepts loopback host %s as %s', (input, expected) => {
    expect(resolveApiHost(input)).toBe(expected);
  });

  it.each(['0.0.0.0', '192.168.1.20', '::', 'shipwright.example'])(
    'rejects non-loopback host %s',
    (input) => {
      expect(() => resolveApiHost(input)).toThrow(/API_HOST must be a loopback address/);
    },
  );
});

describe('resolveProjectRoots', () => {
  it.each([undefined, '', '  ', ' ; ;  '])('resolves empty configuration %s to an empty allowlist', (input) => {
    expect(resolveProjectRoots(input)).toEqual([]);
  });

  it('retains semicolon-separated root parsing', () => {
    expect(resolveProjectRoots(' C:\\projects ; ; D:\\work ')).toEqual(['C:\\projects', 'D:\\work']);
  });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  if (root) await rm(root, { recursive: true, force: true });
});

function projectDependencies() {
  const taskRecords = new Map<string, TaskRecord>();
  const workItemOwners = new Map<string, string>();
  const definitionId = randomUUID();
  return {
    checkDatabase: async () => undefined,
    allowedProjectRoots: [root],
    projects: {
      async list() { return [...records.values()]; },
      async create(input: { name: string; repositoryPath: string }) {
        if ([...records.values()].some((project) => project.repositoryPath === input.repositoryPath)) {
          throw Object.assign(new Error('duplicate'), { code: '23505' });
        }
        const now = new Date();
        const record = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
        records.set(record.id, record);
        return record;
      },
    },
    tasks: {
      async list() { return [...taskRecords.values()].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()); },
      async create(input: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt' | 'runs' | 'status'>) {
        const now = new Date();
        const task = { ...input, id: randomUUID(), status: 'ready', createdAt: now, updatedAt: now, runs: [] };
        taskRecords.set(task.id, task);
        return task;
      },
      async workItemBelongsToProject(workItemId: string, projectId: string) {
        return workItemOwners.get(workItemId) === projectId;
      },
      async get(id: string) { return taskRecords.get(id) ?? null; },
      async startRun(id: string, capabilities: readonly string[] | undefined) {
        const task = taskRecords.get(id);
        if (!task) return { kind: 'not_found' as const };
        if (!task.agentDefinitionId || !task.runtime) return { kind: 'definition_required' as const };
        if (!capabilities) return { kind: 'capability_mismatch' as const };
        if (task.runs.some((run) => ['queued', 'starting', 'running', 'waiting_approval', 'waiting_input'].includes(run.status))) return { kind: 'active' as const };
        const run = { id: randomUUID(), taskId: id, attempt: task.runs.length + 1, status: 'queued', agentDefinitionId: task.agentDefinitionId, runtime: task.runtime, createdAt: new Date() };
        task.runs.push(run);
        return { kind: 'created' as const, run };
      },
    },
    agentDefinitions: {
      async list() { return [{ id: definitionId, name: 'Test definition', version: 1, runtime: 'fake', configuration: { requiredCapabilities: [] }, createdAt: new Date() }]; },
      async create(input: { name: string; runtime: string; configuration: Record<string, unknown> }) {
        return { ...input, id: randomUUID(), version: 1, createdAt: new Date() };
      },
    },
    runtimes: {
      list() { return [{ id: 'fake', capabilities: [] }]; },
      get(id: string) { return id === 'fake' ? { id: 'fake', capabilities: [] } : undefined; },
    },
    definitionId,
    workItemOwners,
    taskCount: () => taskRecords.size,
  };
}

describe('GET /health', () => {
  it('reports API and database readiness', async () => {
    const app = await buildApi(projectDependencies());
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'shipwright-api',
      database: 'connected',
    });
  });

  it('registers a canonical allowed Git repository and lists its branch', async () => {
    const app = await buildApi(projectDependencies());
    apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Example', repositoryPath: repository } });
    expect(created.statusCode).toBe(201);
    expect(created.json().repositoryPath).toBe(repository);
    expect(created.json().name).toBe('Example');
    const listed = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
  });

  it('starts with an empty project allowlist and denies repository registration', async () => {
    const dependencies = projectDependencies();
    dependencies.allowedProjectRoots = [];
    const app = await buildApi(dependencies);
    apps.push(app);

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Blocked', repositoryPath: repository },
    });
    expect(denied.statusCode).toBe(400);
    expect(denied.json()).toEqual({ error: 'Repository path is outside configured project roots' });
    expect(records.size).toBe(0);
  });

  it('rejects invalid and out-of-root paths without echoing the path', async () => {
    const app = await buildApi(projectDependencies());
    apps.push(app);
    for (const repositoryPath of [path.join(root, 'missing-secret-path'), os.tmpdir()]) {
      const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Bad', repositoryPath } });
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain(repositoryPath);
    }
  });

  it('returns a deterministic conflict for duplicate repository registration', async () => {
    const app = await buildApi(projectDependencies());
    apps.push(app);
    const payload = { name: 'Example', repositoryPath: repository };
    expect((await app.inject({ method: 'POST', url: '/api/projects', payload })).statusCode).toBe(201);
    const duplicate = await app.inject({ method: 'POST', url: '/api/projects', payload });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'This repository is already registered' });
  });

  it('returns a sanitized server error when project persistence fails', async () => {
    const dependencies = projectDependencies();
    dependencies.projects.create = async () => {
      throw new Error('sensitive database connection details');
    };
    const app = await buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Example', repositoryPath: repository },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Unable to register project' });
    expect(response.body).not.toContain('sensitive database connection details');
  });

  it('returns unavailable without exposing database errors', async () => {
    const app = await buildApi({ ...projectDependencies(),
      checkDatabase: async () => {
        throw new Error('sensitive connection detail');
      },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      service: 'shipwright-api',
      database: 'disconnected',
    });
    expect(response.body).not.toContain('sensitive connection detail');
  });

  it('creates, reads, and explicitly starts separate task attempts', async () => {
    const dependencies = projectDependencies();
    const app = await buildApi(dependencies);
    apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/tasks', payload: {
      projectId: randomUUID(), title: 'Implement feature', objective: 'Add the feature', acceptanceCriteria: ['It works'], agentDefinitionId: dependencies.definitionId,
    } });
    expect(created.statusCode).toBe(201);
    const task = created.json();
    expect(task.status).toBe('ready');
    expect(task.runs).toEqual([]);
    const first = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/runs` });
    expect(first.statusCode).toBe(202);
    expect(first.json().attempt).toBe(1);
    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().runs).toHaveLength(1);
    const listed = await app.inject({ method: 'GET', url: '/api/tasks' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0]).toMatchObject({ id: task.id, title: 'Implement feature', runs: [{ attempt: 1, status: 'queued' }] });
    const duplicate = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/runs` });
    expect(duplicate.statusCode).toBe(409);
  });

  it('rejects invalid task criteria and returns 404 for missing task detail', async () => {
    const app = await buildApi(projectDependencies());
    apps.push(app);
    const invalid = await app.inject({ method: 'POST', url: '/api/tasks', payload: {
      projectId: randomUUID(), title: 'Invalid', objective: 'Objective', acceptanceCriteria: [''], agentDefinitionId: randomUUID(),
    } });
    expect(invalid.statusCode).toBe(400);
    const missing = await app.inject({ method: 'GET', url: `/api/tasks/${randomUUID()}` });
    expect(missing.statusCode).toBe(404);
  });

  it('returns a sanitized error when the task list cannot be loaded', async () => {
    const dependencies = projectDependencies();
    const app = await buildApi({
      ...dependencies,
      tasks: { ...dependencies.tasks, list: async () => { throw new Error('sensitive database detail'); } },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/tasks' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Unable to load tasks' });
    expect(response.body).not.toContain('sensitive database detail');
  });

  it('allows users to create and list definitions for available runtimes', async () => {
    const app = await buildApi(projectDependencies());
    apps.push(app);
    expect((await app.inject({ method: 'GET', url: '/api/runtimes' })).json()).toEqual([{ id: 'fake', capabilities: [] }]);
    const created = await app.inject({ method: 'POST', url: '/api/agent-definitions', payload: { name: 'Browser definition', runtime: 'fake' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().runtime).toBe('fake');
    expect((await app.inject({ method: 'GET', url: '/api/agent-definitions' })).statusCode).toBe(200);
  });

  it('rejects run launch when the selected runtime adapter has no capability declaration', async () => {
    const dependencies = projectDependencies();
    const app = await buildApi({ ...dependencies, runtimes: { ...dependencies.runtimes, get: () => undefined } });
    apps.push(app);
    const created = await app.inject({ method: 'POST', url: '/api/tasks', payload: {
      projectId: randomUUID(), title: 'Fail closed', objective: 'Do not launch without adapter capabilities', acceptanceCriteria: ['No run created'], agentDefinitionId: dependencies.definitionId,
    } });
    const taskId = created.json().id as string;
    const launch = await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/runs` });
    expect(launch.statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/api/tasks/${taskId}` })).json().runs).toHaveLength(0);
  });

  it('preserves legacy tasks without a definition and gives a clear launch response', async () => {
    const dependencies = projectDependencies();
    const legacyTask: TaskRecord = {
      id: randomUUID(), projectId: randomUUID(), workItemId: null, title: 'Legacy task', objective: 'Existing objective',
      acceptanceCriteria: ['Existing criterion'], status: 'ready', agentDefinitionId: null, runtime: null,
      createdAt: new Date(), updatedAt: new Date(), runs: [],
    };
    dependencies.tasks.get = async (id: string) => id === legacyTask.id ? legacyTask : null;
    const app = await buildApi(dependencies);
    apps.push(app);
    const launch = await app.inject({ method: 'POST', url: `/api/tasks/${legacyTask.id}/runs` });
    expect(launch.statusCode).toBe(409);
    expect(launch.json().error).toContain('Select an agent definition');
    expect(legacyTask.runs).toHaveLength(0);
  });

  it('accepts same-project work items and rejects cross-project associations', async () => {
    const dependencies = projectDependencies();
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const workItemId = randomUUID();
    dependencies.workItemOwners.set(workItemId, projectId);
    const app = await buildApi(dependencies);
    apps.push(app);
    const base = { title: 'Scoped task', objective: 'Keep associations consistent', acceptanceCriteria: ['Project matches'], agentDefinitionId: dependencies.definitionId, workItemId };
    const sameProject = await app.inject({ method: 'POST', url: '/api/tasks', payload: { ...base, projectId } });
    expect(sameProject.statusCode).toBe(201);
    const otherProject = await app.inject({ method: 'POST', url: '/api/tasks', payload: { ...base, projectId: otherProjectId } });
    expect(otherProject.statusCode).toBe(400);
    expect(dependencies.taskCount()).toBe(1);
  });
});

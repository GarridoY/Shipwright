import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { HealthResponse } from '@shipwright/contracts';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ProjectRecord {
  id: string;
  name: string;
  repositoryPath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectStore {
  list(): Promise<ProjectRecord[]>;
  create(input: { name: string; repositoryPath: string }): Promise<ProjectRecord>;
}

export interface ApiDependencies {
  checkDatabase(): Promise<void>;
  projects: ProjectStore;
  allowedProjectRoots: string[];
  tasks: TaskStore;
  agentDefinitions: AgentDefinitionStore;
  runtimes: RuntimeCatalog;
  runEvents?: RunEventStore;
}

export interface PersistedRunEvent {
  id: string;
  runId: string;
  schemaVersion: number;
  sequence: number;
  type: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface RunEventStore {
  listAfter(runId: string, sequence: number, limit?: number): Promise<PersistedRunEvent[]>;
}

const MAX_EVENT_BYTES = 64 * 1024;

export interface AgentDefinitionRecord {
  id: string;
  name: string;
  version: number;
  runtime: string;
  configuration: Record<string, unknown>;
  createdAt: Date;
}

export interface AgentDefinitionStore {
  list(): Promise<AgentDefinitionRecord[]>;
  create(input: { name: string; runtime: string; configuration: Record<string, unknown> }): Promise<AgentDefinitionRecord>;
}

export interface RuntimeDescriptor {
  id: string;
  capabilities: readonly string[];
}

export interface RuntimeCatalog {
  list(): RuntimeDescriptor[];
  get(id: string): RuntimeDescriptor | undefined;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  workItemId: string | null;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  status: string;
  agentDefinitionId: string | null;
  runtime: string | null;
  createdAt: Date;
  updatedAt: Date;
  runs: RunRecord[];
}

export interface RunRecord {
  id: string;
  taskId: string;
  attempt: number;
  status: string;
  agentDefinitionId: string;
  runtime: string;
  createdAt: Date;
}

export interface DashboardTaskRecord {
  id: string;
  projectId: string;
  title: string;
  status: string;
  agentDefinitionId: string | null;
  runtime: string | null;
  updatedAt: Date;
  latestRunStatus: string | null;
}

export interface DashboardSnapshot {
  tasks: DashboardTaskRecord[];
  taskLimit: number;
  totalTasks: number;
  activeRuns: number;
  needsAttention: number;
}

export interface TaskStore {
  dashboard(limit: number): Promise<DashboardSnapshot>;
  create(input: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt' | 'runs' | 'status'>): Promise<TaskRecord>;
  workItemBelongsToProject(workItemId: string, projectId: string): Promise<boolean>;
  get(id: string): Promise<TaskRecord | null>;
  startRun(taskId: string, runtimeCapabilities: readonly string[] | undefined): Promise<{ kind: 'created'; run: RunRecord } | { kind: 'not_found' | 'ineligible' | 'active' | 'capability_mismatch' | 'definition_required' }>;
}

export const DASHBOARD_TASK_LIMIT = 8;

export async function buildApi(dependencies: ApiDependencies) {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  });

  app.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    try {
      await dependencies.checkDatabase();
      return { status: 'ok', service: 'shipwright-api', database: 'connected' };
    } catch {
      reply.code(503);
      return { status: 'error', service: 'shipwright-api', database: 'disconnected' };
    }
  });

  app.get('/api/projects', async (_request, reply) => {
    try {
      const projects = await dependencies.projects.list();
      return Promise.all(projects.map(async (project) => ({
        ...project,
        currentBranch: await readBranch(project.repositoryPath),
      })));
    } catch {
      reply.code(500);
      return { error: 'Unable to list projects' };
    }
  });

  app.post<{ Body: { name: string; repositoryPath: string } }>('/api/projects', async (request, reply) => {
    const { name, repositoryPath } = request.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200 ||
        typeof repositoryPath !== 'string' || !repositoryPath.trim() || repositoryPath.length > 4096) {
      reply.code(400);
      return { error: 'A project name and repository path are required' };
    }

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(repositoryPath.trim());
      const roots = await Promise.all(dependencies.allowedProjectRoots.map((root) => realpath(root)));
      if (!roots.some((root) => isWithin(root, canonicalPath))) {
        reply.code(400);
        return { error: 'Repository path is outside configured project roots' };
      }
      if (!(await stat(canonicalPath)).isDirectory()) throw new Error('invalid repository');
      const { stdout: gitRootOutput } = await execFileAsync(
        'git', ['-C', canonicalPath, 'rev-parse', '--show-toplevel'],
        { timeout: 3000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
      );
      if (await realpath(gitRootOutput.trim()) !== canonicalPath) throw new Error('path is not the repository root');
    } catch {
      reply.code(400);
      return { error: 'Repository path is invalid or inaccessible' };
    }

    let project: ProjectRecord;
    try {
      project = await dependencies.projects.create({ name: name.trim(), repositoryPath: canonicalPath });
    } catch (error) {
      if (isDuplicate(error)) {
        reply.code(409);
        return { error: 'This repository is already registered' };
      }
      reply.code(500);
      return { error: 'Unable to register project' };
    }

    reply.code(201);
    return { ...project, currentBranch: await readBranch(canonicalPath) };
  });

  app.get('/api/runtimes', async () => dependencies.runtimes.list());

  app.get('/api/agent-definitions', async (_request, reply) => {
    try {
      return await dependencies.agentDefinitions.list();
    } catch {
      reply.code(500);
      return { error: 'Unable to list agent definitions' };
    }
  });

  app.post<{ Body: { name: string; runtime: string } }>('/api/agent-definitions', async (request, reply) => {
    const { name, runtime } = request.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200 ||
        typeof runtime !== 'string' || !dependencies.runtimes.get(runtime)) {
      reply.code(400);
      return { error: 'A definition name and available runtime are required' };
    }
    try {
      const definition = await dependencies.agentDefinitions.create({ name: name.trim(), runtime, configuration: { requiredCapabilities: [] } });
      reply.code(201);
      return definition;
    } catch {
      reply.code(500);
      return { error: 'Unable to create agent definition' };
    }
  });

  app.post<{ Body: { projectId: string; workItemId?: string | null; title: string; objective: string; acceptanceCriteria: string[]; agentDefinitionId: string } }>('/api/tasks', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.projectId !== 'string' || !body.projectId ||
        typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200 ||
        typeof body.objective !== 'string' || !body.objective.trim() || body.objective.trim().length > 20_000 ||
        !Array.isArray(body.acceptanceCriteria) || body.acceptanceCriteria.length > 100 ||
        !body.acceptanceCriteria.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 2000) ||
        typeof body.agentDefinitionId !== 'string' || !body.agentDefinitionId ||
        (body.workItemId !== undefined && body.workItemId !== null && typeof body.workItemId !== 'string')) {
      reply.code(400);
      return { error: 'Invalid task input' };
    }
    try {
      if (body.workItemId && !(await dependencies.tasks.workItemBelongsToProject(body.workItemId, body.projectId))) {
        reply.code(400);
        return { error: 'Work item does not belong to the specified project' };
      }
      const definition = (await dependencies.agentDefinitions.list()).find((item) => item.id === body.agentDefinitionId);
      if (!definition) {
        reply.code(400);
        return { error: 'Agent definition does not exist' };
      }
      const task = await dependencies.tasks.create({ ...body, runtime: definition.runtime, title: body.title.trim(), objective: body.objective.trim(), acceptanceCriteria: body.acceptanceCriteria.map((item) => item.trim()), workItemId: body.workItemId ?? null });
      reply.code(201);
      return task;
    } catch {
      reply.code(400);
      return { error: 'Task references are invalid or could not be saved' };
    }
  });

  app.get('/api/dashboard', async (_request, reply) => {
    try {
      return await dependencies.tasks.dashboard(DASHBOARD_TASK_LIMIT);
    } catch {
      reply.code(500);
      return { error: 'Unable to load dashboard' };
    }
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const task = await dependencies.tasks.get(request.params.id);
    if (!task) {
      reply.code(404);
      return { error: 'Task not found' };
    }
    return task;
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/events/stream', async (request, reply) => {
    if (!dependencies.runEvents) {
      reply.code(503);
      return { error: 'Run event streaming is unavailable' };
    }
    const rawCursor = request.headers['last-event-id'];
    const cursorText = typeof rawCursor === 'string' ? rawCursor : '0';
    if (!/^(0|[1-9][0-9]*)$/.test(cursorText) || !Number.isSafeInteger(Number(cursorText))) {
      reply.code(400);
      return { error: 'Last-Event-ID must be a non-negative event sequence' };
    }
    let cursor = Number(cursorText);
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const abort = () => response.end();
    response.once('close', abort);
    const waitForDrain = () => new Promise<void>((resolve) => response.once('drain', resolve));
    try {
      while (!response.destroyed && !response.writableEnded) {
        const events = await dependencies.runEvents.listAfter(request.params.id, cursor, 100);
        for (const event of events) {
          if (!isValidPersistedEvent(event, request.params.id, cursor)) {
            response.end();
            return;
          }
          const safeEvent = redactEvent(event);
          const encoded = JSON.stringify(safeEvent);
          if (Buffer.byteLength(encoded, 'utf8') > MAX_EVENT_BYTES) {
            response.end();
            return;
          }
          if (!response.write(`id: ${event.sequence}\nevent: run-event\ndata: ${encoded}\n\n`)) await waitForDrain();
          cursor = event.sequence;
        }
        if (events.length === 0) {
          if (!response.write(': keep-alive\n\n')) await waitForDrain();
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch {
      if (!response.destroyed && !response.writableEnded) response.end();
    } finally {
      response.off('close', abort);
    }
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/runs', async (request, reply) => {
    try {
      const task = await dependencies.tasks.get(request.params.id);
      if (!task) {
        reply.code(404);
        return { error: 'Task not found' };
      }
      if (!task.agentDefinitionId || !task.runtime) {
        reply.code(409);
        return { error: 'Select an agent definition before starting this legacy task; create a new task with a definition to proceed' };
      }
      const runtime = dependencies.runtimes.get(task.runtime);
      const result = await dependencies.tasks.startRun(request.params.id, runtime?.capabilities);
      if (result.kind === 'created') {
        reply.code(202);
        return result.run;
      }
      const codes = { not_found: 404, ineligible: 409, active: 409, capability_mismatch: 422, definition_required: 409 } as const;
      const messages = { not_found: 'Task not found', ineligible: 'Task is not eligible to run', active: 'Task already has an active run', capability_mismatch: 'Runtime does not meet agent definition requirements', definition_required: 'Select an agent definition before starting this legacy task; create a new task with a definition to proceed' } as const;
      reply.code(codes[result.kind]);
      return { error: messages[result.kind] };
    } catch {
      reply.code(500);
      return { error: 'Unable to start task run' };
    }
  });

  return app;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function readBranch(repositoryPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'branch', '--show-current'], { timeout: 3000, windowsHide: true });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function isValidPersistedEvent(event: PersistedRunEvent, runId: string, cursor: number): boolean {
  if (event.runId !== runId || !Number.isSafeInteger(event.sequence) || event.sequence <= cursor ||
      event.schemaVersion !== 1 || !(event.timestamp instanceof Date) || Number.isNaN(event.timestamp.getTime()) ||
      typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) return false;
  const payload = event.payload;
  switch (event.type) {
    case 'run.status_changed': return (payload.from === null || typeof payload.from === 'string') && typeof payload.to === 'string';
    case 'task.status_changed': return typeof payload.from === 'string' && typeof payload.to === 'string';
    case 'run.output': return (payload.stream === 'stdout' || payload.stream === 'stderr') && typeof payload.text === 'string';
    case 'run.activity': return ['reading', 'editing', 'testing', 'thinking'].includes(String(payload.activity));
    case 'approval.requested': return typeof payload.approvalRequestId === 'string' && typeof payload.operation === 'string';
    case 'approval.resolved': return typeof payload.approvalRequestId === 'string' && (payload.decision === 'approved' || payload.decision === 'denied');
    case 'artifact.created': return typeof payload.artifactId === 'string' && typeof payload.kind === 'string';
    case 'run.checkpointed': return typeof payload.checkpointId === 'string';
    default: return false;
  }
}

function redactEvent(event: PersistedRunEvent): PersistedRunEvent {
  const redact = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value === 'string') return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/\b(token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      /token|password|secret|api[_-]?key|credential/i.test(key) ? '[REDACTED]' : redact(nested),
    ]));
  };
  return { ...event, payload: redact(event.payload) as Record<string, unknown> };
}

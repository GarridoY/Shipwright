import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApi } from './app.js';
import { resolveApiHost } from './config.js';
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

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  if (root) await rm(root, { recursive: true, force: true });
});

function projectDependencies() {
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
});

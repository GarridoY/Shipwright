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
}

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

    try {
      const canonicalPath = await realpath(repositoryPath.trim());
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
      const project = await dependencies.projects.create({ name: name.trim(), repositoryPath: canonicalPath });
      reply.code(201);
      return { ...project, currentBranch: await readBranch(canonicalPath) };
    } catch (error) {
      if (isDuplicate(error)) {
        reply.code(409);
        return { error: 'This repository is already registered' };
      }
      reply.code(400);
      return { error: 'Repository path is invalid or inaccessible' };
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

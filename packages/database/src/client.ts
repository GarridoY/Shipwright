import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { agentDefinitions, agentRuns, projects, tasks } from './schema/index.js';
import { desc, eq } from 'drizzle-orm';
import { supportsCapabilities } from '@shipwright/domain';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  return {
    db,
    projects: {
      async list() {
        return db.select().from(projects).orderBy(projects.name);
      },
      async create(input: { name: string; repositoryPath: string }) {
        const [project] = await db.insert(projects).values(input).returning();
        if (!project) throw new Error('Project insert returned no record');
        return project;
      },
    },
    agentDefinitions: {
      async list() {
        return db.select().from(agentDefinitions).orderBy(agentDefinitions.name, agentDefinitions.version);
      },
      async create(input: { name: string; runtime: string; configuration: Record<string, unknown> }) {
        const [definition] = await db.insert(agentDefinitions).values({ ...input, version: 1 }).returning();
        if (!definition) throw new Error('Agent definition insert returned no record');
        return definition;
      },
    },
    tasks: {
      async create(input: { projectId: string; workItemId: string | null; title: string; objective: string; acceptanceCriteria: string[]; agentDefinitionId: string; runtime: string }) {
        const [task] = await db.insert(tasks).values({ ...input, status: 'ready' }).returning();
        if (!task) throw new Error('Task insert returned no record');
        return { ...task, runs: [] };
      },
      async get(id: string) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
        if (!task) return null;
        const runs = await db.select().from(agentRuns).where(eq(agentRuns.taskId, id)).orderBy(desc(agentRuns.attempt));
        return { ...task, runs };
      },
      async startRun(taskId: string, runtimeCapabilities: readonly string[] | undefined) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
        if (!task) return { kind: 'not_found' as const };
        if (task.status !== 'ready') return { kind: 'ineligible' as const };
        if (!task.agentDefinitionId || !task.runtime) return { kind: 'definition_required' as const };
        const prior = await db.select().from(agentRuns).where(eq(agentRuns.taskId, taskId));
        if (prior.some((run) => ['queued', 'starting', 'running', 'waiting_approval', 'waiting_input'].includes(run.status))) return { kind: 'active' as const };
        const [definition] = await db.select().from(agentDefinitions).where(eq(agentDefinitions.id, task.agentDefinitionId));
        if (!definition || definition.runtime !== task.runtime) return { kind: 'capability_mismatch' as const };
        if (!runtimeCapabilities) return { kind: 'capability_mismatch' as const };
        const config = definition.configuration;
        if (!supportsCapabilities(config.requiredCapabilities ?? [], runtimeCapabilities)) return { kind: 'capability_mismatch' as const };
        try {
          const [run] = await db.insert(agentRuns).values({ taskId, attempt: prior.reduce((max, item) => Math.max(max, item.attempt), 0) + 1, status: 'queued', agentDefinitionId: task.agentDefinitionId, runtime: task.runtime }).returning();
          if (!run) throw new Error('Run insert returned no record');
          return { kind: 'created' as const, run };
        } catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return { kind: 'active' as const };
          throw error;
        }
      },
    },
    async checkConnection(): Promise<void> {
      await pool.query('select 1');
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { agentDefinitions, agentRuns, projects, runEvents, tasks, workItems } from './schema/index.js';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { supportsCapabilities } from '@shipwright/domain';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  const workItemBelongsToProject = async (workItemId: string, projectId: string) => {
    const [workItem] = await db.select({ id: workItems.id }).from(workItems).where(and(eq(workItems.id, workItemId), eq(workItems.projectId, projectId)));
    return Boolean(workItem);
  };

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
        if (input.workItemId && !(await workItemBelongsToProject(input.workItemId, input.projectId))) {
          throw new Error('Work item does not belong to the specified project');
        }
        const [task] = await db.insert(tasks).values({ ...input, status: 'ready' }).returning();
        if (!task) throw new Error('Task insert returned no record');
        return { ...task, runs: [] };
      },
      async dashboard(limit: number) {
        const [summary, recentTasks] = await Promise.all([
          db.select({
            totalTasks: count(tasks.id),
            activeRuns: sql<number>`count(*) filter (where exists (
              select 1 from agent_runs active_run
              where active_run.task_id = ${tasks.id}
                and active_run.status in ('queued', 'starting', 'running', 'waiting_approval', 'waiting_input')
            ))::int`,
            needsAttention: sql<number>`count(*) filter (
              where exists (
                select 1 from agent_runs attention_run
                where attention_run.task_id = ${tasks.id}
                  and attention_run.status in ('waiting_approval', 'waiting_input')
              )
                or (
                  not exists (
                    select 1 from agent_runs active_run
                    where active_run.task_id = ${tasks.id}
                      and active_run.status in ('queued', 'starting', 'running', 'waiting_approval', 'waiting_input')
                  )
                  and (
                    ${tasks.status} in ('review', 'blocked')
                    or (
                      select latest_run.status from agent_runs latest_run
                      where latest_run.task_id = ${tasks.id}
                      order by latest_run.attempt desc
                      limit 1
                    ) = 'failed'
                  )
                )
            )::int`,
          }).from(tasks),
          db.select({
            id: tasks.id,
            projectId: tasks.projectId,
            title: tasks.title,
            status: tasks.status,
            agentDefinitionId: tasks.agentDefinitionId,
            runtime: tasks.runtime,
            updatedAt: tasks.updatedAt,
            latestRunStatus: sql<string | null>`(
              select ${agentRuns.status}
              from ${agentRuns}
              where ${agentRuns.taskId} = ${tasks.id}
              order by ${agentRuns.attempt} desc
              limit 1
            )`,
          }).from(tasks).orderBy(desc(tasks.createdAt), desc(tasks.id)).limit(limit),
        ]);
        const counts = summary[0];
        return {
          tasks: recentTasks,
          taskLimit: limit,
          totalTasks: counts?.totalTasks ?? 0,
          activeRuns: counts?.activeRuns ?? 0,
          needsAttention: counts?.needsAttention ?? 0,
        };
      },
      async workItemBelongsToProject(workItemId: string, projectId: string) {
        return workItemBelongsToProject(workItemId, projectId);
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
    runEvents: {
      async listAfter(runId: string, sequence: number, limit = 100) {
        return db.select().from(runEvents)
          .where(and(eq(runEvents.runId, runId), sql`${runEvents.sequence} > ${sequence}`))
          .orderBy(runEvents.sequence).limit(limit);
      },
      async append(input: { runId: string; schemaVersion: number; type: string; payload: Record<string, unknown>; timestamp?: Date }) {
        return db.transaction(async (transaction) => {
          // Lock the run row so concurrent writers allocate distinct, ordered sequence numbers.
          const [run] = await transaction.select({ id: agentRuns.id }).from(agentRuns)
            .where(eq(agentRuns.id, input.runId)).for('update');
          if (!run) throw new Error('Run not found');
          const [latest] = await transaction.select({ sequence: runEvents.sequence }).from(runEvents)
            .where(eq(runEvents.runId, input.runId)).orderBy(desc(runEvents.sequence)).limit(1);
          const [event] = await transaction.insert(runEvents).values({
            ...input,
            sequence: (latest?.sequence ?? 0) + 1,
          }).returning();
          if (!event) throw new Error('Run event insert returned no record');
          return event;
        });
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

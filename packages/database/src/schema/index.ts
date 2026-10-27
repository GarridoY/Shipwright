import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const applicationMetadata = pgTable('application_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  repositoryPath: text('repository_path').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('projects_repository_path_uidx').on(table.repositoryPath)]);

export const workItems = pgTable('work_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('work_items_project_id_idx').on(table.projectId)]);

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  workItemId: uuid('work_item_id').references(() => workItems.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  objective: text('objective').notNull(),
  acceptanceCriteria: jsonb('acceptance_criteria').$type<string[]>().notNull().default([]),
  agentDefinitionId: uuid('agent_definition_id').references(() => agentDefinitions.id),
  runtime: text('runtime'),
  status: text('status').notNull().default('backlog'),
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index('tasks_created_at_id_idx').on(table.createdAt.desc(), table.id.desc()),
  index('tasks_project_id_idx').on(table.projectId),
  index('tasks_work_item_id_idx').on(table.workItemId),
  check('tasks_status_check', sql`${table.status} in ('backlog', 'ready', 'in_progress', 'validation', 'review', 'done', 'blocked')`),
  check('tasks_version_check', sql`${table.version} >= 0`),
]);

export const taskDependencies = pgTable('task_dependencies', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  dependsOnTaskId: uuid('depends_on_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (table) => [
  primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
  check('task_dependencies_not_self_check', sql`${table.taskId} <> ${table.dependsOnTaskId}`),
]);

export const agentDefinitions = pgTable('agent_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  version: integer('version').notNull(),
  runtime: text('runtime').notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('agent_definitions_name_version_uidx').on(table.name, table.version), check('agent_definitions_version_check', sql`${table.version} > 0`)]);

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  attempt: integer('attempt').notNull(),
  status: text('status').notNull().default('queued'),
  version: integer('version').notNull().default(0),
  agentDefinitionId: uuid('agent_definition_id').notNull().references(() => agentDefinitions.id),
  runtime: text('runtime').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex('agent_runs_task_attempt_uidx').on(table.taskId, table.attempt),
  uniqueIndex('agent_runs_one_active_per_task_uidx').on(table.taskId).where(sql`${table.status} in ('queued', 'starting', 'running', 'waiting_approval', 'waiting_input')`),
  index('agent_runs_task_id_idx').on(table.taskId),
  check('agent_runs_attempt_check', sql`${table.attempt} > 0`),
  check('agent_runs_version_check', sql`${table.version} >= 0`),
  check('agent_runs_status_check', sql`${table.status} in ('queued', 'starting', 'running', 'waiting_approval', 'waiting_input', 'completed', 'failed', 'cancelled')`),
]);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  baseRevision: text('base_revision'),
  createdAt: createdAt(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}, (table) => [uniqueIndex('workspaces_run_id_uidx').on(table.runId)]);

export const runEvents = pgTable('run_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemaVersion: integer('schema_version').notNull(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  type: text('type').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
}, (table) => [
  uniqueIndex('run_events_run_sequence_uidx').on(table.runId, table.sequence),
  check('run_events_version_check', sql`${table.schemaVersion} > 0`),
  check('run_events_sequence_check', sql`${table.sequence} > 0`),
]);

export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  operation: text('operation').notNull(),
  resource: text('resource').notNull(),
  argumentsHash: text('arguments_hash').notNull(),
  scope: text('scope').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [index('approval_requests_run_id_idx').on(table.runId)]);

export const approvalResolutions = pgTable('approval_resolutions', {
  id: uuid('id').primaryKey().defaultRandom(),
  approvalRequestId: uuid('approval_request_id').notNull().references(() => approvalRequests.id, { onDelete: 'cascade' }),
  decision: text('decision').notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('approval_resolutions_request_id_uidx').on(table.approvalRequestId), check('approval_resolutions_decision_check', sql`${table.decision} in ('approved', 'denied')`)]);

export const policyRules = pgTable('policy_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  effect: text('effect').notNull(),
  capability: text('capability').notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [check('policy_rules_effect_check', sql`${table.effect} in ('allow', 'deny', 'approval')`)]);

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  mediaType: text('media_type'),
  location: text('location').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (table) => [index('artifacts_run_id_idx').on(table.runId)]);

export const checkpoints = pgTable('checkpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  runtime: text('runtime').notNull(),
  state: jsonb('state').notNull(),
  createdAt: createdAt(),
}, (table) => [index('checkpoints_run_id_idx').on(table.runId)]);

export const executionLeases = pgTable('execution_leases', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  owner: text('owner').notNull(),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex('execution_leases_one_active_per_run_uidx').on(table.runId).where(sql`${table.releasedAt} is null`),
  index('execution_leases_expiry_idx').on(table.expiresAt),
]);

export type EntityId = string;

export interface Project {
  id: EntityId;
  name: string;
  repositoryPath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkItem {
  id: EntityId;
  projectId: EntityId;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskStatus = 'backlog' | 'ready' | 'in_progress' | 'validation' | 'review' | 'done' | 'blocked';

export interface Task {
  id: EntityId;
  projectId: EntityId;
  workItemId: EntityId | null;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  agentDefinitionId: EntityId;
  runtime: string;
  status: TaskStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskDependency {
  taskId: EntityId;
  dependsOnTaskId: EntityId;
  createdAt: Date;
}

export interface AgentDefinition {
  id: EntityId;
  name: string;
  version: number;
  runtime: string;
  configuration: Record<string, unknown>;
  createdAt: Date;
}

export type RunStatus = 'queued' | 'starting' | 'running' | 'waiting_approval' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';

export interface AgentRun {
  id: EntityId;
  taskId: EntityId;
  attempt: number;
  status: RunStatus;
  version: number;
  agentDefinitionId: EntityId;
  runtime: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface Workspace {
  id: EntityId;
  runId: EntityId;
  path: string;
  baseRevision: string | null;
  createdAt: Date;
  removedAt: Date | null;
}

export interface RunEvent<TType extends RunEventType = RunEventType> {
  id: EntityId;
  schemaVersion: number;
  runId: EntityId;
  sequence: number;
  type: TType;
  timestamp: Date;
  payload: RunEventPayloads[TType];
}

export interface RunEventPayloads {
  'run.status_changed': { from: RunStatus | null; to: RunStatus };
  'task.status_changed': { from: TaskStatus; to: TaskStatus };
  'run.output': { stream: 'stdout' | 'stderr'; text: string };
  'approval.requested': { approvalRequestId: EntityId; operation: string };
  'approval.resolved': { approvalRequestId: EntityId; decision: 'approved' | 'denied' };
  'artifact.created': { artifactId: EntityId; kind: string };
  'run.checkpointed': { checkpointId: EntityId };
};

export type RunEventType = keyof RunEventPayloads;

export type ApprovalDecision = 'approved' | 'denied';

export interface ApprovalRequest {
  id: EntityId;
  runId: EntityId;
  operation: string;
  resource: string;
  argumentsHash: string;
  scope: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ApprovalResolution {
  id: EntityId;
  approvalRequestId: EntityId;
  decision: ApprovalDecision;
  decidedAt: Date;
}

export interface PolicyRule {
  id: EntityId;
  name: string;
  effect: 'allow' | 'deny' | 'approval';
  capability: string;
  configuration: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Artifact {
  id: EntityId;
  runId: EntityId;
  kind: string;
  name: string;
  mediaType: string | null;
  location: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface Checkpoint {
  id: EntityId;
  runId: EntityId;
  runtime: string;
  state: unknown;
  createdAt: Date;
}

export interface ExecutionLease {
  id: EntityId;
  runId: EntityId;
  owner: string;
  heartbeatAt: Date;
  expiresAt: Date;
  releasedAt: Date | null;
  createdAt: Date;
}

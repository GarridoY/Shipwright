import type { RunStatus, TaskStatus } from './entities.js';

export class InvalidTransitionError extends Error {
  constructor(readonly entity: 'task' | 'run', readonly from: string, readonly to: string) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class ConcurrentUpdateError extends Error {
  constructor(readonly entity: 'task' | 'run', readonly id: string, readonly expectedVersion: number) {
    super(`${entity} ${id} was modified; expected version ${expectedVersion}`);
    this.name = 'ConcurrentUpdateError';
  }
}

const taskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ['ready', 'blocked'],
  ready: ['backlog', 'in_progress', 'blocked'],
  in_progress: ['validation', 'blocked'],
  validation: ['in_progress', 'review', 'blocked'],
  review: ['in_progress', 'done', 'blocked'],
  done: [],
  blocked: ['backlog', 'ready', 'in_progress'],
};

const runTransitions: Record<RunStatus, readonly RunStatus[]> = {
  queued: ['starting', 'cancelled'],
  starting: ['running', 'failed', 'cancelled'],
  running: ['waiting_approval', 'waiting_input', 'completed', 'failed', 'cancelled'],
  waiting_approval: ['running', 'failed', 'cancelled'],
  waiting_input: ['running', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function transitionTask(status: TaskStatus, next: TaskStatus): TaskStatus {
  if (!taskTransitions[status].includes(next)) throw new InvalidTransitionError('task', status, next);
  return next;
}

export function transitionRun(status: RunStatus, next: RunStatus): RunStatus {
  if (!runTransitions[status].includes(next)) throw new InvalidTransitionError('run', status, next);
  return next;
}

/** Apply an optimistic-lock update; persistence adapters should use `version` in their UPDATE predicate too. */
export function assertVersion(entity: 'task' | 'run', id: string, actualVersion: number, expectedVersion: number): number {
  if (actualVersion !== expectedVersion) throw new ConcurrentUpdateError(entity, id, expectedVersion);
  return actualVersion + 1;
}

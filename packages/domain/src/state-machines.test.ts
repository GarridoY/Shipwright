import { describe, expect, it } from 'vitest';
import { assertVersion, ConcurrentUpdateError, InvalidTransitionError, transitionRun, transitionTask } from './state-machines.js';

describe('task and run lifecycle', () => {
  it('allows successful task and run transitions independently', () => {
    expect(transitionTask('backlog', 'ready')).toBe('ready');
    expect(transitionTask('ready', 'in_progress')).toBe('in_progress');
    expect(transitionTask('in_progress', 'validation')).toBe('validation');
    expect(transitionTask('validation', 'review')).toBe('review');
    expect(transitionTask('review', 'done')).toBe('done');
    expect(transitionRun('queued', 'starting')).toBe('starting');
    expect(transitionRun('starting', 'running')).toBe('running');
    expect(transitionRun('running', 'completed')).toBe('completed');
  });

  it('rejects invalid transitions and terminal run reuse', () => {
    expect(() => transitionTask('done', 'in_progress')).toThrow(InvalidTransitionError);
    expect(() => transitionRun('completed', 'queued')).toThrow(InvalidTransitionError);
    expect(() => transitionTask('in_progress', 'done')).toThrow(InvalidTransitionError);
  });

  it('detects optimistic-lock conflicts between concurrent updates', () => {
    expect(assertVersion('task', 'task-1', 3, 3)).toBe(4);
    expect(() => assertVersion('run', 'run-1', 4, 3)).toThrow(ConcurrentUpdateError);
  });
});

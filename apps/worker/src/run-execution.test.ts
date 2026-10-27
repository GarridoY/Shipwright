import { describe, expect, it } from 'vitest';
import { FakeRuntime } from '@shipwright/runtime-core';
import { executeRuntimeRun } from './run-execution.js';

describe('executeRuntimeRun', () => {
  it('persists normalized fake runtime events in order before execution completes', async () => {
    const persisted: Array<{ runId: string; sequence: number; type: string; payload: Record<string, unknown> }> = [];
    const writer = {
      async append(input: { runId: string; type: string; payload: Record<string, unknown> }) {
        persisted.push({ ...input, sequence: persisted.length + 1 });
      },
    };

    await executeRuntimeRun(new FakeRuntime(), {
      runId: 'run-deterministic', workspacePath: '/workspace', instructions: 'Verify event persistence',
    }, writer);

    expect(persisted).toMatchObject([
      { runId: 'run-deterministic', sequence: 1, type: 'run.activity', payload: { activity: 'reading' } },
      { runId: 'run-deterministic', sequence: 2, type: 'run.output', payload: { stream: 'stdout', text: 'Fake runtime completed deterministic work.' } },
      { runId: 'run-deterministic', sequence: 3, type: 'run.completed', payload: { exitCode: 0 } },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import type { RuntimeAdapter } from './runtime.js';

/** Shared contract suite: adapter implementations can invoke this with their own factory. */
export function runtimeContractTests(createRuntime: () => RuntimeAdapter): void {
  describe('runtime adapter contract', () => {
    it('launches, attaches, streams normalized ordered events, and terminates', async () => {
      const runtime = createRuntime();
      const session = await runtime.launch({ runId: 'run-1', workspacePath: '/workspace', instructions: 'Do work' });
      expect(session).toMatchObject({ runtimeId: runtime.runtimeId, runId: 'run-1' });
      expect(await runtime.attach(session.sessionId)).toEqual(session);
      const events = [];
      for await (const event of runtime.streamEvents(session.sessionId)) events.push(event);
      expect(events.length).toBeGreaterThan(0);
      expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));
      expect(events.every((event) => event.schemaVersion === 1 && event.sessionId === session.sessionId)).toBe(true);
      await expect(runtime.terminate(session.sessionId)).resolves.toBeUndefined();
    });

    it('supports interactive messages and permission responses', async () => {
      const runtime = createRuntime();
      const session = await runtime.launch({ runId: 'run-2', workspacePath: '/workspace', instructions: 'Wait' });
      await runtime.sendMessage(session.sessionId, 'Continue');
      await runtime.respondToPermission(session.sessionId, {
        requestId: 'permission-1', decision: 'approved', approvalId: 'approval-1',
      });
    });

    it('rejects unsupported required capabilities before launching', async () => {
      const runtime = createRuntime();
      const unsupported = Object.entries(runtime.capabilities).find(([, enabled]) => !enabled)?.[0];
      if (!unsupported) return;
      await expect(runtime.launch({
        runId: 'run-3', workspacePath: '/workspace', instructions: 'Do work',
        requirements: { capabilities: [unsupported as keyof typeof runtime.capabilities] },
      })).rejects.toThrow(`Runtime does not support required capability: ${unsupported}`);
    });
  });
}

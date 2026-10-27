import { describe, expect, it } from 'vitest';
import { FakeRuntime } from './fake-runtime.js';
import { runtimeContractTests } from './runtime-contract.js';

runtimeContractTests(() => new FakeRuntime());

describe('FakeRuntime scenarios', () => {
  it('emits a stable, deterministic event sequence including permission signals', async () => {
    const options = {
      timestamp: '2026-10-26T12:00:00.000Z',
      steps: [
        { type: 'activity' as const, activity: 'editing' as const },
        { type: 'permission_requested' as const, request: { requestId: 'p1', operation: 'git.push', resource: 'origin', argumentsHash: 'hash' } },
        { type: 'message' as const, text: 'done' },
        { type: 'completed' as const, exitCode: 0 },
      ],
    };
    async function collect(runtime: FakeRuntime) {
      const session = await runtime.launch({ runId: 'run', workspacePath: '/w', instructions: 'work' });
      await runtime.respondToPermission(session.sessionId, { requestId: 'p1', decision: 'denied', reason: 'test denial' });
      const events = [];
      for await (const event of runtime.streamEvents(session.sessionId)) events.push(event);
      return events;
    }
    expect(await collect(new FakeRuntime(options))).toEqual(await collect(new FakeRuntime(options)));
    expect((await collect(new FakeRuntime(options))).map(({ type }) => type)).toEqual([
      'activity', 'permission_requested', 'permission_resolved', 'message', 'completed',
    ]);
  });

  it('represents scripted failures as normalized failed events', async () => {
    const runtime = new FakeRuntime({ steps: [{ type: 'failed', code: 'agent_error', message: 'The fake failed' }] });
    const session = await runtime.launch({ runId: 'run', workspacePath: '/w', instructions: 'work' });
    const events = [];
    for await (const event of runtime.streamEvents(session.sessionId)) events.push(event);
    expect(events).toMatchObject([{ type: 'failed', code: 'agent_error', message: 'The fake failed' }]);
  });

  it('supports cancellation via interruption and abort signals', async () => {
    const runtime = new FakeRuntime({ steps: [{ type: 'message', text: 'later', delayMs: 1_000 }] });
    const session = await runtime.launch({ runId: 'run', workspacePath: '/w', instructions: 'work' });
    const controller = new AbortController();
    const pending = (async () => {
      const events = [];
      for await (const event of runtime.streamEvents(session.sessionId, controller.signal)) events.push(event);
      return events;
    })();
    setTimeout(() => controller.abort(), 0);
    await expect(pending).resolves.toMatchObject([{ type: 'interrupted' }]);

    const second = await runtime.launch({ runId: 'run2', workspacePath: '/w', instructions: 'work' });
    await runtime.interrupt(second.sessionId);
    const events = [];
    for await (const event of runtime.streamEvents(second.sessionId)) events.push(event);
    expect(events).toMatchObject([{ type: 'interrupted' }]);
  });

  it('fails unsupported operations explicitly', async () => {
    const runtime = new FakeRuntime({ capabilities: { attach: false, streaming: false } });
    await expect(runtime.launch({
      runId: 'required', workspacePath: '/w', instructions: 'work',
      requirements: { capabilities: ['streaming'] },
    })).rejects.toThrow('Runtime does not support required capability: streaming');
    const session = await runtime.launch({ runId: 'run', workspacePath: '/w', instructions: 'work' });
    await expect(runtime.attach(session.sessionId)).rejects.toThrow("Runtime operation 'attach' requires unsupported capability: attach");
    await expect(runtime.streamEvents(session.sessionId)[Symbol.asyncIterator]().next())
      .rejects.toThrow("Runtime operation 'streamEvents' requires unsupported capability: streaming");
  });
});

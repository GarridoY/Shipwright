import {
  requireRuntimeCapability,
  validateRuntimeRequirements,
  type PermissionResponse,
  type RuntimeAdapter,
  type RuntimeCapabilities,
  type RuntimeEvent,
  type RuntimeLaunchInput,
  type RuntimeSession,
} from './runtime.js';

export type FakeRuntimeStep =
  | { type: 'message'; stream?: 'stdout' | 'stderr'; text: string; delayMs?: number }
  | { type: 'activity'; activity: 'reading' | 'editing' | 'testing' | 'thinking'; delayMs?: number }
  | { type: 'permission_requested'; request: { requestId: string; operation: string; resource: string; argumentsHash: string }; delayMs?: number }
  | { type: 'structured_output'; value: unknown; delayMs?: number }
  | { type: 'checkpoint'; checkpointId: string; state: unknown; delayMs?: number }
  | { type: 'failed'; code: string; message: string; delayMs?: number }
  | { type: 'completed'; exitCode?: number; delayMs?: number };

export interface FakeRuntimeOptions {
  runtimeId?: string;
  capabilities?: Partial<RuntimeCapabilities>;
  steps?: readonly FakeRuntimeStep[];
  /** A stable clock makes event streams byte-for-byte deterministic. */
  timestamp?: string;
}

interface SessionState {
  session: RuntimeSession;
  input: RuntimeLaunchInput;
  steps: readonly FakeRuntimeStep[];
  responses: Map<string, PermissionResponse>;
  messages: string[];
  terminated: boolean;
  interrupted: boolean;
  stopController: AbortController;
  sequence: number;
  streamStarted: boolean;
}

const defaultCapabilities: RuntimeCapabilities = {
  streaming: true,
  interactiveInput: true,
  permissionInteraction: true,
  interruption: true,
  attach: true,
  structuredOutput: true,
  checkpoints: true,
};

export class FakeRuntime implements RuntimeAdapter {
  readonly runtimeId: string;
  readonly capabilities: RuntimeCapabilities;
  private readonly steps: readonly FakeRuntimeStep[];
  private readonly timestamp: string;
  private readonly sessions = new Map<string, SessionState>();
  private nextSession = 1;

  constructor(options: FakeRuntimeOptions = {}) {
    this.runtimeId = options.runtimeId ?? 'fake';
    this.capabilities = { ...defaultCapabilities, ...options.capabilities };
    this.steps = options.steps ?? [
      { type: 'activity', activity: 'reading' },
      { type: 'message', text: 'Fake runtime completed deterministic work.' },
      { type: 'completed', exitCode: 0 },
    ];
    this.timestamp = options.timestamp ?? '2026-01-01T00:00:00.000Z';
  }

  async launch(input: RuntimeLaunchInput): Promise<RuntimeSession> {
    validateRuntimeRequirements(this.capabilities, input.requirements);
    if (input.signal?.aborted) throw abortError();
    const session: RuntimeSession = {
      sessionId: `${this.runtimeId}-session-${this.nextSession++}`,
      runtimeId: this.runtimeId,
      runId: input.runId,
    };
    this.sessions.set(session.sessionId, {
      session,
      input,
      steps: this.steps,
      responses: new Map(),
      messages: [],
      terminated: false,
      interrupted: false,
      stopController: new AbortController(),
      sequence: 0,
      streamStarted: false,
    });
    return session;
  }

  async attach(sessionId: string, signal?: AbortSignal): Promise<RuntimeSession> {
    requireRuntimeCapability(this.capabilities, 'attach', 'attach');
    if (signal?.aborted) throw abortError();
    return this.getSession(sessionId).session;
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    requireRuntimeCapability(this.capabilities, 'sendMessage', 'interactiveInput');
    if (!message.trim()) throw new TypeError('Message must not be empty');
    this.getSession(sessionId).messages.push(message);
  }

  async respondToPermission(sessionId: string, response: PermissionResponse): Promise<void> {
    requireRuntimeCapability(this.capabilities, 'respondToPermission', 'permissionInteraction');
    const state = this.getSession(sessionId);
    state.responses.set(response.requestId, response);
  }

  async *streamEvents(sessionId: string, signal?: AbortSignal): AsyncIterable<RuntimeEvent> {
    requireRuntimeCapability(this.capabilities, 'streamEvents', 'streaming');
    const state = this.getSession(sessionId);
    if (state.streamStarted) throw new Error('Fake runtime event stream can only be consumed once');
    state.streamStarted = true;
    for (const step of state.steps) {
      if (state.terminated || state.interrupted || signal?.aborted || state.input.signal?.aborted) {
        yield this.event(state, { type: 'interrupted' });
        return;
      }
      if ((step.type === 'structured_output' && !this.capabilities.structuredOutput) ||
          (step.type === 'checkpoint' && !this.capabilities.checkpoints)) {
        yield this.event(state, { type: 'failed', code: 'unsupported_capability', message: `Scenario requires unsupported ${step.type} capability` });
        return;
      }
      await delay(step.delayMs ?? 0, [signal, state.input.signal, state.stopController.signal]);
      if (state.terminated || state.interrupted || signal?.aborted || state.input.signal?.aborted) {
        yield this.event(state, { type: 'interrupted' });
        return;
      }
      switch (step.type) {
        case 'message': yield this.event(state, { type: 'message', stream: step.stream ?? 'stdout', text: step.text }); break;
        case 'activity': yield this.event(state, { type: 'activity', activity: step.activity }); break;
        case 'permission_requested': {
          yield this.event(state, { type: 'permission_requested', request: step.request });
          const response = state.responses.get(step.request.requestId);
          if (response) yield this.event(state, { type: 'permission_resolved', response });
          break;
        }
        case 'structured_output': yield this.event(state, { type: 'structured_output', value: step.value }); break;
        case 'checkpoint': yield this.event(state, { type: 'checkpoint', checkpoint: { checkpointId: step.checkpointId, state: step.state } }); break;
        case 'failed': yield this.event(state, { type: 'failed', code: step.code, message: step.message }); return;
        case 'completed': yield this.event(state, { type: 'completed', exitCode: step.exitCode ?? 0 }); return;
      }
    }
  }

  async interrupt(sessionId: string): Promise<void> {
    requireRuntimeCapability(this.capabilities, 'interrupt', 'interruption');
    const state = this.getSession(sessionId);
    state.interrupted = true;
    state.stopController.abort();
  }

  async terminate(sessionId: string): Promise<void> {
    const state = this.getSession(sessionId);
    state.terminated = true;
    state.stopController.abort();
  }

  /** Test observability for deterministic assertions; not part of RuntimeAdapter. */
  getReceivedMessages(sessionId: string): readonly string[] {
    return [...this.getSession(sessionId).messages];
  }

  private event<T extends Omit<RuntimeEvent, 'schemaVersion' | 'sessionId' | 'sequence' | 'timestamp'>>(
    state: SessionState,
    fields: T,
  ): RuntimeEvent {
    return {
      ...fields,
      schemaVersion: 1,
      sessionId: state.session.sessionId,
      sequence: ++state.sequence,
      timestamp: this.timestamp,
    } as RuntimeEvent;
  }

  private getSession(sessionId: string): SessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Unknown runtime session: ${sessionId}`);
    return state;
  }
}

function abortError(): Error {
  const error = new Error('Runtime operation aborted');
  error.name = 'AbortError';
  return error;
}

function delay(milliseconds: number, signals: readonly (AbortSignal | undefined)[]): Promise<void> {
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (milliseconds <= 0 || activeSignals.some((signal) => signal.aborted)) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      for (const signal of activeSignals) signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    for (const signal of activeSignals) signal.addEventListener('abort', finish, { once: true });
  });
}

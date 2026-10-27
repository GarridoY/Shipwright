export interface RuntimeCapabilities {
  streaming: boolean;
  interactiveInput: boolean;
  permissionInteraction: boolean;
  interruption: boolean;
  attach: boolean;
  structuredOutput: boolean;
  checkpoints: boolean;
}

export type CapabilityName = keyof RuntimeCapabilities;

export interface RuntimeRequirements {
  capabilities: readonly CapabilityName[];
}

export interface RuntimeLaunchInput {
  runId: string;
  workspacePath: string;
  instructions: string;
  environment?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  requirements?: RuntimeRequirements;
}

export interface RuntimeSession {
  sessionId: string;
  runtimeId: string;
  runId: string;
}

export interface PermissionRequest {
  requestId: string;
  operation: string;
  resource: string;
  argumentsHash: string;
}

export type PermissionResponse =
  | { requestId: string; decision: 'approved'; approvalId: string }
  | { requestId: string; decision: 'denied'; reason?: string };

export interface RuntimeCheckpoint {
  checkpointId: string;
  state: unknown;
}

interface RuntimeEventBase {
  schemaVersion: 1;
  sessionId: string;
  sequence: number;
  timestamp: string;
}

export type RuntimeEvent =
  | (RuntimeEventBase & { type: 'message'; stream: 'stdout' | 'stderr'; text: string })
  | (RuntimeEventBase & { type: 'activity'; activity: 'reading' | 'editing' | 'testing' | 'thinking' })
  | (RuntimeEventBase & { type: 'permission_requested'; request: PermissionRequest })
  | (RuntimeEventBase & { type: 'permission_resolved'; response: PermissionResponse })
  | (RuntimeEventBase & { type: 'structured_output'; value: unknown })
  | (RuntimeEventBase & { type: 'checkpoint'; checkpoint: RuntimeCheckpoint })
  | (RuntimeEventBase & { type: 'interrupted' })
  | (RuntimeEventBase & { type: 'completed'; exitCode: number })
  | (RuntimeEventBase & { type: 'failed'; code: string; message: string });

export interface RuntimeAdapter {
  readonly runtimeId: string;
  readonly capabilities: RuntimeCapabilities;
  launch(input: RuntimeLaunchInput): Promise<RuntimeSession>;
  attach(sessionId: string, signal?: AbortSignal): Promise<RuntimeSession>;
  sendMessage(sessionId: string, message: string): Promise<void>;
  respondToPermission(sessionId: string, response: PermissionResponse): Promise<void>;
  streamEvents(sessionId: string, signal?: AbortSignal): AsyncIterable<RuntimeEvent>;
  interrupt(sessionId: string): Promise<void>;
  terminate(sessionId: string): Promise<void>;
}

export class UnsupportedRuntimeCapabilityError extends Error {
  constructor(readonly capability: CapabilityName) {
    super(`Runtime does not support required capability: ${capability}`);
    this.name = 'UnsupportedRuntimeCapabilityError';
  }
}

export class UnsupportedRuntimeOperationError extends Error {
  constructor(readonly operation: string, readonly capability: CapabilityName) {
    super(`Runtime operation '${operation}' requires unsupported capability: ${capability}`);
    this.name = 'UnsupportedRuntimeOperationError';
  }
}

export function validateRuntimeRequirements(
  capabilities: RuntimeCapabilities,
  requirements: RuntimeRequirements | undefined,
): void {
  if (!requirements) return;
  for (const capability of requirements.capabilities) {
    if (!(capability in capabilities) || !capabilities[capability]) {
      throw new UnsupportedRuntimeCapabilityError(capability);
    }
  }
}

export function requireRuntimeCapability(
  capabilities: RuntimeCapabilities,
  operation: string,
  capability: CapabilityName,
): void {
  if (!capabilities[capability]) throw new UnsupportedRuntimeOperationError(operation, capability);
}

import type { RuntimeEvent } from './runtime.js';

export interface RunEventWriter {
  append(input: {
    runId: string;
    schemaVersion: number;
    type: string;
    timestamp: Date;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
}

/** Persist each normalized runtime event before requesting the next event from the adapter. */
export async function persistRuntimeEvents(
  runId: string,
  events: AsyncIterable<RuntimeEvent>,
  writer: RunEventWriter,
): Promise<number> {
  let persisted = 0;
  for await (const event of events) {
    const normalized = normalizeRuntimeEvent(runId, event);
    normalized.payload = redactPayload(normalized.payload) as Record<string, unknown>;
    await writer.append(normalized);
    persisted += 1;
  }
  return persisted;
}

function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayload);
  if (typeof value === 'string') return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    /token|password|secret|api[_-]?key|credential/i.test(key) ? '[REDACTED]' : redactPayload(nested),
  ]));
}

function normalizeRuntimeEvent(runId: string, event: RuntimeEvent) {
  let type: string;
  let payload: Record<string, unknown>;
  switch (event.type) {
    case 'message':
      type = 'run.output';
      payload = { stream: event.stream, text: event.text };
      break;
    case 'activity':
      type = 'run.activity';
      payload = { activity: event.activity };
      break;
    case 'permission_requested':
      type = 'approval.requested';
      payload = { approvalRequestId: event.request.requestId, operation: event.request.operation };
      break;
    case 'permission_resolved':
      type = 'approval.resolved';
      payload = { approvalRequestId: event.response.requestId, decision: event.response.decision };
      break;
    case 'structured_output':
      type = 'run.structured_output';
      payload = { value: event.value };
      break;
    case 'checkpoint':
      type = 'run.checkpointed';
      payload = { checkpointId: event.checkpoint.checkpointId };
      break;
    case 'interrupted':
      type = 'run.interrupted';
      payload = {};
      break;
    case 'completed':
      type = 'run.completed';
      payload = { exitCode: event.exitCode };
      break;
    case 'failed':
      type = 'run.failed';
      payload = { code: event.code, message: event.message };
      break;
  }
  return {
    runId,
    schemaVersion: event.schemaVersion,
    type,
    timestamp: new Date(event.timestamp),
    payload,
  };
}

import { persistRuntimeEvents, type RunEventWriter, type RuntimeAdapter, type RuntimeLaunchInput } from '@shipwright/runtime-core';

/** Runtime execution entry point for queue handlers; every event is persisted as it is emitted. */
export async function executeRuntimeRun(
  runtime: RuntimeAdapter,
  input: RuntimeLaunchInput,
  eventWriter: RunEventWriter,
): Promise<void> {
  const session = await runtime.launch(input);
  await persistRuntimeEvents(session.runId, runtime.streamEvents(session.sessionId, input.signal), eventWriter);
}

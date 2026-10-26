# ADR-0009: Start agent integrations with a process-backed CLI harness

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The runtime adapter contract in ADR-0003 keeps provider-specific integration details out of the core domain. Provider CLIs offer a practical first integration path and can reuse provider-supported authentication and agent workflows. Future SDK or direct API integrations should not require changing orchestration concepts.

The factory needs to manage an agent session as a process-backed execution: launch it in the task workspace with a task prompt, observe its output and lifecycle, and support attachment, interaction, interruption, and termination where the runtime permits them.

## Decision

Start with a CLI-backed agent harness, initially evaluating OpenCode CLI. Model the orchestration-facing interface around session operations:

```ts
interface AgentHarness {
  id: string;
  launch(options: LaunchOptions): Promise<AgentSession>;
  attach(sessionId: string): Promise<AgentSession>;
  send(sessionId: string, message: string): Promise<void>;
  respondToPermission(
    sessionId: string,
    requestId: string,
    decision: PermissionDecision
  ): Promise<void>;
  events(sessionId: string): AsyncIterable<HarnessEvent>;
  interrupt(sessionId: string): Promise<void>;
  terminate(sessionId: string): Promise<void>;
}
```

The initial CLI implementation spawns the configured executable from a worker process with an explicit working directory and task prompt. It captures stdout, stderr, exit code, and process lifecycle, and maps observable behavior into normalized harness events. CLI-specific parsing and process management remain in the harness adapter, not the core domain.

Harness capabilities describe which operations a runtime supports. In particular, `send` and `respondToPermission` are not assumed to be available for every CLI or invocation mode; unsupported operations must be reported rather than simulated. Attachment and recovery guarantees must reflect the actual process/session mechanism and must not imply that a process can be reattached after its owning worker or host has exited.

An agent CLI's permission prompts and permission controls are runtime-level signals, not enforcement of Shipwright's security policy. Factory policy remains authoritative and must be enforced at the execution, container, mount, and capability-broker boundaries. CLI permission handling may be surfaced to a user, but accepting or denying a CLI prompt does not grant a factory capability. Until enforcement is complete, use disposable test repositories and disable privileged capabilities.

SDK- and API-backed harnesses may be added later behind the same orchestration-facing contract, with their own declared capabilities and session semantics.

## Consequences

- The first real adapter can be built around a provider CLI without making CLI process semantics part of domain state.
- stdout/stderr and exit status are useful observations, but completion still requires the factory's structured output contract and deterministic validation evidence where applicable.
- CLIs vary in structured output, interaction, and session recovery; adapters must declare concrete guarantees and normalize only supported behavior.
- Runtime-level permission UX must remain separate from policy evaluation and capability enforcement.

## Alternatives considered

- Start with provider SDKs or direct APIs: deferred until there is a demonstrated need for capabilities that the CLI path cannot provide.
- Make CLI execution itself the runtime contract: rejected because it would couple orchestration and persisted state to provider-specific process behavior and obstruct later SDK/API harnesses.

## Revisit when

- The first CLI adapter reveals contract gaps around streaming, interaction, permissions, or recovery.
- SDK/API integrations require materially different lifecycle or event semantics.
- Security enforcement boundaries or execution isolation change.

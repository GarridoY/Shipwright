# ADR-0003: Abstract agent providers behind versioned runtime adapters

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Provider SDKs differ in tool execution, interrupt/resume, sessions, and event formats. The factory must stay usable if its preferred model changes.

## Decision

Core domain defines normalized execution events and a runtime adapter contract. Every adapter declares capabilities (streaming, tool approvals, native resume, interactive input, structured outputs). Use a fake adapter for contract tests. Reject unsupported feature requirements.

The initial real adapter is process-backed and CLI-based; see [ADR-0009](0009-cli-first-agent-harness.md). This selects the first integration transport without changing the provider-neutral runtime contract. SDK- or API-backed adapters remain possible behind that contract.

## Consequences

Provider independence but some features are nonportable. Persist opaque adapter checkpoints and advertise actual resumption guarantees instead of flattening differences.

## Alternatives considered

- A more complex distributed design was deferred until demonstrated by real requirements.
- Starting with a provider SDK or direct API was deferred in favor of a CLI-backed first adapter; see [ADR-0009](0009-cli-first-agent-harness.md).

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

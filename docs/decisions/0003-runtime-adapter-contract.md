# ADR-0003: Abstract agent providers behind versioned runtime adapters

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Provider SDKs differ in tool execution, interrupt/resume, sessions, and event formats. The factory must stay usable if its preferred model changes.

## Decision

Core domain defines normalized execution events and a runtime adapter contract. Every adapter declares capabilities (streaming, tool approvals, native resume, interactive input, structured outputs). Use a fake adapter for contract tests. Reject unsupported feature requirements.

## Consequences

Provider independence but some features are nonportable. Persist opaque adapter checkpoints and advertise actual resumption guarantees instead of flattening differences.

## Alternatives considered

- A more complex distributed design or provider-specific shortcut was deferred until demonstrated by real requirements.

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

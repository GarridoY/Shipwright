# ADR-0006: Model tasks, runs, and events independently

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

A run can fail and be retried without invalidating a task. A dashboard needs both current status and a reconstructable history of actions and interventions.

## Decision

Maintain independent task and agent-run state machines. Persist typed immutable events with schema versions and per-run sequences; derive dashboard attention signals from raw activity, but store authoritative state in relational tables. Stream persisted events over SSE with replay support.

## Consequences

Supports audit and resilient UI reconnection. Introduces schema governance and event volume; define retention/redaction policies before long-term operation.

## Alternatives considered

- A more complex distributed design or provider-specific shortcut was deferred until demonstrated by real requirements.

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

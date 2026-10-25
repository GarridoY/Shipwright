# ADR-0008: Use leased execution with explicit recovery semantics

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Background jobs may be redelivered and workers may crash during sensitive side effects. Blind replay can duplicate commits, pushes, or external requests.

## Decision

Acquire a unique execution lease per run, renew heartbeats, reconcile expired leases, and use idempotency keys for safe actions. Use runtime-native checkpoints only when supported. Resume only from validated checkpoints; reconcile external side effects before re-execution.

## Consequences

Safer recovery with more state-machine logic. Not all external calls can be made exactly once; surface uncertainty to the user rather than automatically repeating unsafe operations.

## Alternatives considered

- A more complex distributed design or provider-specific shortcut was deferred until demonstrated by real requirements.

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

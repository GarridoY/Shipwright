# ADR-0002: Use PostgreSQL as authoritative state and queue backing store

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Task/run state, approvals, and event histories must survive restarts. The system needs reliable coordination without operating multiple data services.

## Decision

Persist domain entities and append-only events in PostgreSQL with Drizzle migrations. Use pg-boss for jobs. Treat queue delivery as at-least-once; enforce idempotent handlers, unique execution leases, and transactional state changes.

## Consequences

Simplifies operation and recovery; adds Postgres as a local prerequisite. A queued job is not authoritative run state. Add an outbox or reconciliation logic for write/enqueue consistency.

## Alternatives considered

- A more complex distributed design or provider-specific shortcut was deferred until demonstrated by real requirements.

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

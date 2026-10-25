# ADR-0001: Use a modular monolith with separate execution workers

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

The first deployment is one local developer machine. A distributed microservice system would add complexity without improving the first vertical slice.

## Decision

Use a Fastify modular-monolith control plane, separate Node.js worker processes, and a Next.js UI. Keep explicit module boundaries and define stable worker job contracts.

## Consequences

Fewer moving parts and easy local debugging. Worker crashes are isolated from the API, but control-plane scaling is intentionally constrained. Reconsider if remote or multi-user operation becomes necessary.

## Alternatives considered

- A more complex distributed design or provider-specific shortcut was deferred until demonstrated by real requirements.

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

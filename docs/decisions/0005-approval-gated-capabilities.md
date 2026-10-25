# ADR-0005: Enforce approval-gated access through a capability broker

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

A prompt telling an agent to request permission is not security. An agent with arbitrary host shell/network access could circumvent SDK tool hooks.

## Decision

Define typed capability operations and a policy engine with allow/deny/approval effects. Use a broker for restricted HTTP/filesystem/Git operations and sandbox restrictions to prevent bypass. Persist immutable requests and bind grants to normalized operation arguments, resource, scope, and expiry.

## Consequences

Clear auditability and scoped approvals. Requires careful policy matching, symlink/redirect/DNS safeguards, and conservative behavior when approval state is ambiguous.

## Alternatives considered

- A more complex distributed design or provider-specific shortcut was deferred until demonstrated by real requirements.

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

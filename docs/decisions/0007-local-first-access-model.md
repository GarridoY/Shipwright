# ADR-0007: Bind interfaces locally and defer remote access

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

The first user is a single developer running the factory locally. Exposing privileged worker controls over a network creates unnecessary risk.

## Decision

Bind API and UI to loopback by default, use per-install secrets where relevant, validate origins/CSRF for state-changing routes, and keep remote control and multi-user authentication out of MVP. Do not expose the broker or worker control interfaces publicly.

## Consequences

Small attack surface with no initial collaboration features. If remote access is needed, design authentication, TLS, authorization, and hardened deployment separately.

## Alternatives considered

- A more complex distributed design or provider-specific shortcut was deferred until demonstrated by real requirements.

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

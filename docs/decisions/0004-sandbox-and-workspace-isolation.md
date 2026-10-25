# ADR-0004: Separate source isolation from security isolation

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Agents execute untrusted code and may process adversarial repository content. Git worktrees do not isolate host processes, network, or shared Git metadata.

## Decision

Run agent commands in restricted containers without host credentials, sensitive mounts, Docker socket, or unrestricted outbound network. Use a separate clone initially, or validated worktrees with protected Git metadata. The host execution manager enforces container and mount boundaries.

## Consequences

Extra setup and slower startup in exchange for defensible boundaries. Containers reduce risk but are not a perfect boundary; document supported threat model and revisit VM isolation for stronger adversaries.

## Alternatives considered

- A more complex distributed design or provider-specific shortcut was deferred until demonstrated by real requirements.

## Revisit when

- The local single-user threat model, throughput needs, or runtime feature guarantees materially change.

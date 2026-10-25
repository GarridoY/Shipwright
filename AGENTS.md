# Instructions for coding agents

This file applies to the repository root and every subdirectory unless a nearer `AGENTS.md` explicitly overrides part of it. Treat this as repository policy, not a substitute for OS/container enforcement.

## Mission

Build a **local-first, task-driven software factory** that orchestrates interchangeable coding-agent runtimes. Prioritize correctness, explicit approvals, transparent behavior, and small vertical slices. Avoid speculative framework abstractions.

## Read first

1. `README.md` — purpose, scope, lifecycle, planned stack.
2. `docs/decisions/` — accepted architecture decisions; propose a new ADR for material changes.
3. The relevant issue under `docs/backlog/` — scope, dependencies, acceptance criteria.

## Working agreement

- Work on **one issue** (or clearly bounded slice) at a time. Restate scope and acceptance criteria before implementation.
- Preserve the separation of **domain**, **control plane**, **runtime adapters**, **execution plane**, and **capability enforcement**.
- Use TypeScript strict mode; validate all external input at process boundaries. Keep core domain modules independent of Fastify, Next.js, Drizzle, Docker, and provider SDKs.
- Prefer narrowly-scoped modules and dependency injection over global singletons.
- Persist important state transitions transactionally and emit typed, versioned events. Queue jobs are at-least-once; handlers must be idempotent.
- Never infer task success from agent text alone. Require explicit structured output and deterministic validation evidence where applicable.
- Keep run state separate from task state; a failed run must not automatically mark its task permanently failed.
- Introduce tests for changes to state machines, policy evaluation, adapters, worker recovery, and API contracts.
- Use the fake runtime for deterministic scenarios (streaming, approval, failure, retry, cancellation).
- Avoid broad refactors or new dependencies unless justified by the current issue.

## Security rules — non-negotiable

- **Do not** grant an agent unrestricted host filesystem, Docker socket, private SSH keys, credential directories, or host network by default.
- **Do not** equate a Git worktree with a sandbox. Validate how `.git` metadata and shared Git objects are exposed to containers.
- **Do not** assume a prompt or SDK permission hook enforces access restrictions. Enforce capabilities at the container, mount, and broker boundaries.
- External filesystem access, outbound HTTP, Git pushes/merges, secrets, and destructive operations must respect explicit policy and approval scopes.
- Bind approvals to immutable operation parameters (e.g., canonical resource + arguments hash); prevent replay and time-of-check/time-of-use substitution.
- For HTTP brokering, guard against private/loopback destinations, unsafe redirects, DNS rebinding, oversized responses, and accidental credential forwarding.
- Never print secrets, tokens, credentials, or full sensitive HTTP payloads in logs, events, prompts, or test fixtures.
- Before permissions are fully enforced, use **disposable test repositories only** and disable privileged capabilities.
- If an issue cannot be implemented securely under these constraints, stop and report the blocker rather than bypassing the controls.

## Definition of done

A change is done when:

1. It meets the issue's **acceptance criteria** and respects its exclusions.
2. Relevant lint, type-check, unit/integration tests, and build succeed (once configured).
3. New APIs/events/configuration are documented, typed, and versioned if necessary.
4. Errors, cancellation, and recoverability are considered for asynchronous behavior.
5. Tests cover at least one unhappy path for privileged or stateful code.
6. No secrets, test artifacts, unwanted generated files, or unrelated changes are committed.
7. The PR description explains the change, test evidence, risks, and any manual approval required.

## Implementation preferences

- pnpm workspace packages; TypeScript with explicit public interfaces.
- REST for commands/read models; SSE for replayable run events.
- Database schema changes through versioned Drizzle migrations, never only runtime synchronization.
- Use unique IDs and monotonic per-run event sequence numbers; event schemas should include a version.
- Treat runtime-native checkpoints as opaque; surface adapter capability differences instead of promising universal resume.
- Fail closed on authorization uncertainty and reject unsupported runtime capabilities at launch.
- Create focused ADRs for changes to storage, isolation, permission model, runtime contract, or delivery guarantees.

## Agent response format

At the end of an implementation task report:

- **Implemented:** files/modules changed and observable behavior.
- **Validated:** exact commands/tests and results (or why not run).
- **Risks / blockers:** unresolved issues and policy constraints.
- **Artifacts:** related commit, diff, or issue references if available.

Do not claim tests ran when they did not. Do not claim an approval was given unless the system recorded one.

# ADR-0010: Use isolated clones and a no-network Docker runner initially

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Projects are registered as canonical host repository paths. Runs are persisted by the API, but the worker currently accepts a caller-provided workspace path, has no queue consumer, and the runtime catalog contains only an in-process fake adapter. A workspace/container boundary must be established before an agent process can safely execute against project source.

Git worktrees share repository metadata and are not a security boundary. Container bind mounts and networking must be deliberately constrained; passing runtime permissions or a Git worktree alone does not protect the host.

## Decision

- Provision one independent, regular Git clone per run under a dedicated, explicitly configured `WORKSPACES_ROOT`.
- Resolve and persist the source repository's `HEAD` at provisioning time. Create a unique branch derived from the immutable run ID.
- Do not use Git worktrees, shared clones, reference repositories, alternates, or hard-linked Git object storage for the initial implementation; use `--no-hardlinks` for local clones. Never mount the registered source checkout into the run container.
- Initially support agent containers only on Docker Desktop using its WSL2 backend. Unsupported or unavailable container environments fail closed.
- Disable container networking. Do not mount host credentials, the Docker socket, or any host path other than that run's workspace. The workspace is the only writable host bind mount. Enforce a read-only container root filesystem, non-root user, all capabilities dropped, no-new-privileges, and bounded resources; fail closed if the runtime/image cannot honor these requirements.
- Keep failed-run workspaces and artifacts until explicit cleanup. Clean completed/cancelled workspaces only after artifacts have been persisted. Provisioning, termination, and cleanup operations must be idempotent and recoverable after worker/process termination.
- Run real Docker-backed security integration tests locally on the supported environment. CI may run deterministic tests without Docker, but those tests do not substitute for the Docker-backed checks.
- Treat the local host, Docker daemon, and host administrator as trusted. Containers reduce exposure to untrusted repository content but are not a VM boundary and do not defend against a compromised host/kernel or hostile administrator. Multi-user and remote execution are out of scope.

The initial workspace and runner slices are tracked by [#34](https://github.com/GarridoY/Shipwright/issues/34) and [#35](https://github.com/GarridoY/Shipwright/issues/35), under [#7](https://github.com/GarridoY/Shipwright/issues/7). This decision does not claim that queued runs or the in-process fake runtime execute inside containers; worker/queue integration with a process-backed runtime is subsequent work.

## Consequences

- Each run has a source snapshot and Git metadata independent from the registered checkout, at the cost of clone time and disk space.
- Initial container execution is limited to a local Docker Desktop/WSL2 environment and cannot access remote services. Runtime credentials and approved capabilities require a separately enforced broker/policy design.
- Failed-run inspection requires explicit cleanup, while completed/cancelled workspace cleanup must follow successful artifact persistence.
- Docker integration tests require a supported local Docker daemon and disposable repositories; CI's configuration-only/unit tests cannot alone prove mount or network isolation.

## Alternatives considered

- Use Git worktrees with guarded metadata: deferred until metadata and mount exposure can be constrained and security-tested.
- Support Docker, Podman, and multiple host platforms immediately: deferred to avoid claiming unverified execution semantics.
- Permit outbound network by default: rejected; network access requires a separately designed and enforced capability boundary.
- Integrate with the current in-process fake runtime: deferred because it does not provide a process boundary suitable for container execution.

## Revisit when

- A process-backed runtime and queue consumer are integrated with the runner.
- A supported non-WSL2 host/container runtime is security-tested.
- Approved network access, credentials, or stronger-than-local-user adversaries are in scope.

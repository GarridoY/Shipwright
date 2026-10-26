# Shipwright

> A local-first, opinionated control plane for personal software development with autonomous coding agents and explicit human approval at privilege boundaries.

**Status:** Foundation / pre-MVP. The local monorepo foundation is runnable; product workflows are not yet implemented.

## Vision

Create tasks in a browser, assign versioned agent definitions, execute them in isolated Git workspaces, observe progress, approve sensitive operations, and review validated code changes. The factory owns workflow, permissions, execution state, and evidence; interchangeable agent runtimes own their reasoning and coding loops.

## Design principles

1. **Task-centric:** Tasks and their acceptance criteria outlive any individual agent run.
2. **Local-first:** The control plane, database, and workers run on the developer's machine.
3. **Runtime-agnostic:** Provider SDK types never leak into the core domain.
4. **Approval-gated autonomy:** Agents act independently *inside* enforced limits; restricted operations require explicit authorization.
5. **Observable by default:** Persist typed execution events, artifacts, and intervention reasons.
6. **Deterministic orchestration:** Application code controls scheduling, retries, state transitions, and policy decisions.
7. **Incremental delivery:** Build one complete vertical slice before multiplying agents and workflows.

## Planned experience

1. Register an existing local Git repository as a project.
2. Create a work item or task with objective and acceptance criteria.
3. Choose an agent definition and runtime; start a run.
4. The worker provisions a separate workspace and constrained execution environment.
5. Watch live activity, logs, tests, and diffs in the dashboard.
6. Review and resolve narrowly scoped approval requests.
7. Inspect commits and validation evidence before integration.

## Architecture

```text
Browser (Next.js)
      | REST + SSE
      v
Control plane (Fastify modular monolith)
  | project/task orchestration | policies/approvals | events/artifacts |
      |                         |
      v                         v
PostgreSQL (Drizzle)       pg-boss queue
                                  |
                                  v
                         Worker / execution manager
                          | runtime adapter (pluggable)
                          | capability broker
                          v
                      Isolated container
                      + per-attempt Git workspace
```

- **Control plane:** Authoritative task and run state, deterministic scheduling, approval decisions, API.
- **Execution plane:** Queue consumers, workspace provisioning, sandbox lifecycle, runtime adapters.
- **Capability plane:** Enforced filesystem/network/Git/secret access, scoped approvals, audit events.

**Important:** A Git worktree is source isolation, **not** a security boundary. Agent shell access must be restricted at the container/VM boundary. Do not pass host credentials or unrestricted network access to agents.

## Proposed technology

| Concern | Initial choice |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo |
| UI | Next.js + React |
| API | Fastify + TypeScript |
| Persistence | PostgreSQL + Drizzle |
| Queue | pg-boss (at-least-once delivery; idempotent jobs required) |
| Workers | Node.js processes |
| Execution isolation | Docker + isolated clone/worktree strategy |
| Live updates | Server-Sent Events |
| Agent integration | `runtime-core` adapter; one real adapter initially, fake for tests |
| Agent configuration | Versioned YAML + Markdown |

## Domain vocabulary

- **Project:** Registered local repository and project settings.
- **Work item:** Feature/bug/initiative containing tasks.
- **Task:** Bounded objective and acceptance criteria, independent of run attempts.
- **Agent definition:** Versioned prompt, runtime requirements, allowed capabilities, and output contract.
- **Agent run:** One execution attempt for a task.
- **Workspace:** Isolated source checkout associated with a task attempt.
- **Run event:** Immutable typed observation about execution.
- **Approval request/decision:** Immutable requested operation and human resolution, with scoped grant.
- **Artifact:** Diff, commit, test report, log, or other run output.
- **Checkpoint:** Runtime-specific continuation state, only when supported by that adapter.

## Lifecycle

**Tasks:** `backlog -> ready -> in_progress -> validation -> review -> done`, with `blocked` for recoverable impediments.

**Runs:** `queued -> starting -> running -> completed | failed | cancelled`; `running` may transition through `waiting_approval` or `waiting_input`. Task failure and run failure are not equivalent.

The UI additionally derives *activity* (editing, testing, reading) and *attention signals* (approval required, unresponsive, apparent lack of progress) without equating these to persisted lifecycle states.

## MVP milestones

| Phase | Goal | Done when |
| --- | --- | --- |
| 0. Foundation | Monorepo, API, UI, DB, contracts | Sample project can be persisted and displayed |
| 1. First execution | Task → run → workspace → agent → artifacts | Browser task produces inspectable code changes |
| 2. Approval & recovery | Policy enforcement, approval inbox, interruption handling | Restricted request waits safely and can be authorized/resumed |
| 3. Concurrent agents | Queue, leases, dependencies, second adapter | Independent work runs concurrently and survives restart |
| 4. Delivery pipeline | Plan, validate, review, integration gate | Feature arrives with review and test evidence |
| 5. Operations | Metrics, cleanup, audit, retention | Historical runs are searchable and diagnosable |

**First usable MVP:** End of phase 2. Before policy enforcement is complete, run only disposable test repositories with privileged capabilities disabled.

## Repository layout

The initial runnable structure follows [issue 001: Bootstrap monorepo](https://github.com/GarridoY/Shipwright/issues/1). Folders should be added when they contain useful code; don't create empty packages solely to mirror the target tree.

## Development status and setup

### Prerequisites

- Node.js 22.14.0 (see `.node-version`)
- pnpm 10.6.5 (Corepack is recommended)
- Docker Engine/Desktop with Compose v2, or Podman with a Compose provider
- Git

From the repository root, copy `.env.example` to `.env`, then install and start the local services:

```sh
corepack enable
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

The web app is available at <http://localhost:3000>, and the API health endpoint at <http://127.0.0.1:4000/health>. The worker runs alongside them and exits cleanly on Ctrl+C. The health endpoint checks PostgreSQL connectivity. Use `pnpm db:down` to stop the database. With Podman, use `pnpm db:up:podman` and `pnpm db:down:podman` instead.

`PROJECT_ALLOWED_ROOTS` is optional. When unset or blank, the API starts with an empty project allowlist and project registration is denied. Before registering a project, configure one or more permitted local directories in `.env`, separated by semicolons (for example, `PROJECT_ALLOWED_ROOTS=C:/Users/you/source;D:/work`). No directory is allowed implicitly.

Run the repository checks with `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`. `pnpm db:migrate` applies checked-in Drizzle SQL migrations to a blank database as well as an existing one. `.env` contains development-only local credentials; do not use them outside local development.

`API_HOST` accepts only loopback addresses (`127.0.0.0/8`, `::1`, or `localhost`, which binds to `127.0.0.1`); a non-loopback value fails at startup. On Windows, run Docker Desktop with the WSL 2 backend or a Podman machine, and execute the pnpm commands in PowerShell, Windows Terminal, or a WSL shell. Compose requires Docker Compose v2 or a Podman Compose provider. Remote access is not configured; the API listens on loopback.

## Planning and contributions

- Read [AGENTS.md](AGENTS.md) before making changes.
- Architectural decisions are recorded under [docs/decisions](docs/decisions).
- The prioritized issues are tracked in [GitHub Issues](https://github.com/GarridoY/Shipwright/issues).
- Start with [issue 001](https://github.com/GarridoY/Shipwright/issues/1) and follow its dependencies.
- Each change should provide tests and evidence against the relevant issue's acceptance criteria.

## Non-goals for MVP

Dynamic agent swarms, Kubernetes, a visual workflow builder, autonomous production deployment, long-term vector memory, and silent bypasses of permission boundaries.

## License

Not selected yet. Do not assume that this repository is open source until an explicit license is added.

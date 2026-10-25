# Shipwright

> A local-first, opinionated control plane for personal software development with autonomous coding agents and explicit human approval at privilege boundaries.

**Status:** Design / pre-MVP. This repository describes an intended system; features listed below are not yet implemented.

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

The intended structure is defined in [issue 001: Bootstrap monorepo](docs/backlog/001-bootstrap-monorepo.md). Folders should be added when they contain useful code; don't create empty packages solely to mirror the target tree.

## Development status and setup

This starter pack contains **documentation and GitHub issue drafts**, not yet a runnable application. Until the bootstrap issue is implemented, there are no working `dev`, `test`, or migration commands. The future bootstrap should document prerequisites (Node LTS, pnpm, Docker, Git), environment setup, one-command startup, and tests in this section.

## Planning and contributions

- Read [AGENTS.md](AGENTS.md) before making changes.
- Architectural decisions are recorded under [docs/decisions](docs/decisions).
- The prioritized issue drafts are under [docs/backlog](docs/backlog), with a [backlog index](docs/backlog/README.md).
- Start with issue 001 and follow its dependencies.
- Each change should provide tests and evidence against the relevant issue's acceptance criteria.

## Non-goals for MVP

Dynamic agent swarms, Kubernetes, a visual workflow builder, autonomous production deployment, long-term vector memory, and silent bypasses of permission boundaries.

## License

Not selected yet. Do not assume that this repository is open source until an explicit license is added.

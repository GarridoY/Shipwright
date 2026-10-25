# Architecture Decision Records

Accepted decisions are numbered, immutable in intent, and revised through a superseding ADR when materially changed.

| ADR | Topic |
| --- | --- |
| [0001](0001-modular-monolith-and-workers.md) | Use a modular monolith with separate execution workers |
| [0002](0002-postgresql-source-of-truth.md) | Use PostgreSQL as authoritative state and queue backing store |
| [0003](0003-runtime-adapter-contract.md) | Abstract agent providers behind versioned runtime adapters |
| [0004](0004-sandbox-and-workspace-isolation.md) | Separate source isolation from security isolation |
| [0005](0005-approval-gated-capabilities.md) | Enforce approval-gated access through a capability broker |
| [0006](0006-typed-events-and-separate-lifecycles.md) | Model tasks, runs, and events independently |
| [0007](0007-local-first-access-model.md) | Bind interfaces locally and defer remote access |
| [0008](0008-recovery-and-idempotency.md) | Use leased execution with explicit recovery semantics |

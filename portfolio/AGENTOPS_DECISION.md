# AgentOps prepared base decision

## Decision

Use `automation-control-plane` as the **prepared base** for the AgentOps target. Do not create another repository during the active freeze.

This is not a release or archive decision. It becomes approved only after review, exact source-SHA inventory, collision analysis, compatibility contracts, import rehearsal, and counter-proofs.

## Why this base

The selected repository already exposes durable SQLite state, strict workflow schemas, idempotent submissions, bounded retries and deadlines, digest-bound approvals, atomic leases, budgets, kill switches, recovery, a tamper-evident audit chain, machine-readable CLI behavior, a loopback-only read-only surface, and broad negative/concurrency tests.

`agentmesh` is narrower and remains valuable as a `routing_evidence` module: route health, agent ownership, and deterministic fail-closed evidence. It should be imported behind a stable module contract rather than used as the root control plane.

## Module boundaries

| Source | Target module | Initial disposition |
| --- | --- | --- |
| `automation-control-plane` | `core` | selected base |
| `agentmesh` | `routing_evidence` | import after contract tests |
| `agent-budgeter` | `budgets` | compare and deduplicate |
| `agent-inbox` | `operator_inbox` | import after schema review |
| `agent-quota-simulator` | `quota_simulation` | import as a test lab |
| `agent-retry-kit` | `retry_policy` | compare and deduplicate |
| `agent-session-recorder` | `session_evidence` | import after redaction review |
| `circuit-breaker-lab` | `circuit_breakers` | import as a test lab |
| `context-window-budgeter` | `context_budgets` | import after schema review |
| `human-in-the-loop-queue` | `approvals_queue` | compare and deduplicate |
| `idempotency-kit` | `idempotency` | compare and deduplicate |
| `taskgraph` | `task_graph` | compare and deduplicate |
| `timeout-toolkit` | `timeouts` | compare and deduplicate |

## Non-negotiable invariants

- no arbitrary shell, subprocess, network, dynamic import, or executable workflow handler;
- exact source and tree hashes before import;
- one owner and public contract per module;
- no duplicate implementation under two names;
- compatibility tests for old and new imports/commands;
- no archive before release, consumer, redirect, rollback, and human gates pass.

# AgentOps prepared base decision

## Decision and current state

Use `automation-control-plane` as the **prepared base** for the AgentOps target. Do not create another repository during the active freeze.

Current evidence is bound to draft [automation-control-plane PR #4](https://github.com/vigilanty0x/automation-control-plane/pull/4), head `cc89dce628202c0ec590567fc7f41ad9637a8012`, and successful GitHub Actions run `32091685544`. The target is now in `REHEARSAL`; the decision remains `PREPARED`.

This does **not** claim `MERGED`, `TAGGED`, `RELEASED`, post-release `VERIFIED`, `REDIRECTED`, or `ARCHIVED`.

## What the rehearsal proves

On the explicit Ubuntu 24.04 runner, both Python 3.11 and 3.12 jobs passed:

- sdist and wheel builds with an exact reviewed CI toolchain;
- separate clean-environment installations and `pip check`;
- durable CLI and AgentOps sdist/wheel parity;
- 102 unit and adversarial tests per job;
- bytecode, public-boundary, repository, module, and installed-CLI checks;
- bounded routing, context, quota, session, circuit, inventory, and read-only inbox receipts.

The one-time assembly verified the archive digest, exact membership, every file digest and byte count, regular-file type, and path containment before the resulting tree was committed. Temporary bootstrap material was removed.

## Evidence lifetime

The implementation, source-inventory, receipt, and CI observations were recorded at `2026-08-18T02:26:33Z` and expire at `2026-09-17T02:26:33Z`. An expired or inaccessible proof returns the AgentOps evidence gate to `BLOCKED`; it never inherits a permanent green status.

## Why this base

The selected repository already exposes durable SQLite state, strict workflow schemas, idempotent submissions, bounded retries and deadlines, digest-bound approvals, atomic leases, budgets, kill switches, recovery, a tamper-evident audit chain, machine-readable CLI behavior, a loopback-only read-only surface, and broad negative/concurrency tests.

`agentmesh` remains valuable as the bounded `routing_evidence` contract. The rehearsal imports no source history and does not create a second durable queue or execution engine.

## Module boundaries

| Source | Target module | Current disposition |
| --- | --- | --- |
| `automation-control-plane` | `core` | selected durable base |
| `agentmesh` | `routing_evidence` | bounded contract rehearsal |
| `agent-budgeter` | `budgets` | deduplicated into durable core |
| `agent-inbox` | `operator_inbox` | read-only projection rehearsal |
| `agent-quota-simulator` | `quota_simulation` | bounded test-lab rehearsal |
| `agent-retry-kit` | `retry_policy` | deduplicated into durable core |
| `agent-session-recorder` | `session_evidence` | redaction-aware contract rehearsal |
| `circuit-breaker-lab` | `circuit_breakers` | bounded test-lab rehearsal |
| `context-window-budgeter` | `context_budgets` | bounded contract rehearsal |
| `human-in-the-loop-queue` | `approvals_queue` | deduplicated into durable core |
| `idempotency-kit` | `idempotency` | deduplicated into durable core |
| `taskgraph` | `task_graph` | deduplicated into durable core |
| `timeout-toolkit` | `timeouts` | deduplicated into durable core |

## Gate status

| Gate | State | Meaning |
| --- | --- | --- |
| source SHA inventory | `PASS` | Exact dated main SHAs are recorded for all thirteen sources. |
| collision report | `PASS` | Duplicate durable responsibilities and bounded module seams are documented. |
| compatibility contract | `PASS` | New `agentops` interface and deliberate non-aliases are documented. |
| contract rehearsal | `PASS` | Current head and installed artifacts passed the bounded counter-proofs. |
| human product decision | `BLOCKED` | No named human has approved the final irreversible product boundary. |
| source-history import | `NOT_RUN` | No Git history or source implementation is represented as imported. |
| consumer inventory | `NOT_RUN` | Imports, packages, workflows, links, docs, and dependants remain to inventory. |
| release | `BLOCKED` | No stable tag, GitHub Release, SBOM, provenance, or post-publication proof exists. |
| redirect | `BLOCKED` | Legacy repositories remain active and supported. |
| rollback | `NOT_RUN` | No migration rollback has been rehearsed. |
| archive | `BLOCKED` | No source may be archived. |

## Non-negotiable invariants

- no arbitrary shell, subprocess, network, dynamic import, or executable workflow handler;
- one durable owner for approvals, budgets, retries, task graphs, idempotency, deadlines, leases, kill switches, and audit;
- exact source SHA evidence expires and must be refreshed;
- compatibility tests precede every legacy alias or deprecation;
- contract rehearsal and source-history import remain separate facts;
- no archive before release, consumers, redirect, rollback, and named human approval all pass.

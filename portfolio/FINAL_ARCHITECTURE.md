# Concrete-six public portfolio architecture

Status: **PREPARED LOCALLY — NOT APPLIED ON GITHUB**.

This is the canonical destination map for turning the current public repository
collection into six concrete multi-tool products. It is a plan and a local
implementation contract, not evidence that repository settings or the visible
GitHub repository count have changed.

## Honest counts

- Current observed public registry: **112 public repositories**.
- Prepared public destination: **6 product repositories + 2 support
  repositories = 8 public repositories**.
- Connected-account destination: **9 repositories**, consisting of those eight
  public repositories and one private repository represented only as an
  aggregate count.
- Public source identities assigned: **112/112**, exactly once.
- Non-target public repositories in a completed transition: **104**.
- Deletion, transfer, archive, redirect, and automatic mutation: **not
  authorized by this document**.

The 18-target `portfolio/targets.json` registry remains the safe description of
the observed public GitHub state while migration evidence is incomplete.

## Six concrete products

| Product repository | Public source identities | Coherent scope |
|---|---:|---|
| `automation-control-plane` | 23 | Governed agent and software automation, jobs, worktrees, budgets, handoffs, routing, and recovery |
| `promptops` | 15 | Prompt/model evaluation, regressions, local model operations, scorecards, and routing |
| `rag-lab` | 10 | Retrieval, citations, corpora, datasets, freshness, indexing, and RAG evaluation |
| `shipcheck` | 15 | CI, merge/release readiness, risk, test evidence, deployment truth, and rollback |
| `repo-doctor` | 26 | Repository/runtime diagnostics, dependency and configuration health, developer documentation, and provenance |
| `proofgate` | 16 | Evidence contracts, audit/replay, defensive policy, security checks, API/schema contracts, and webhooks |

TrustKit and Contract Lab are preserved under ProofGate because their
fail-closed policy, contract, and security evidence fits that product boundary.
Putting network and webhook security tools inside Repo Doctor would weaken Repo
Doctor's offline diagnostic identity.

## Two public support repositories

| Support repository | Public source identities | Purpose |
|---|---:|---|
| `.github` | 2 | Account-wide community health, reusable CI, governance, and workflow templates |
| `vigilanty0x` | 5 | Profile, evidence dashboard, Portfolio Kit, build metrics, and portfolio generation |

`portfolio-kit` becomes a package inside the profile support repository;
`workflow-templates` becomes a package inside `.github`. Neither remains a
separate final repository in this prepared topology.

## Machine-checked coverage

[`final-architecture.json`](final-architecture.json) contains every source
assignment. The validator derives the authoritative 112-name public universe
from [`targets.json`](targets.json), then rejects missing, duplicate, unexpected,
or incorrectly routed repositories.

```bash
node scripts/check-final-architecture.mjs \
  portfolio/final-architecture.json portfolio/targets.json
```

The validator also rejects any state that:

- differs from six products and two supports;
- differs from eight public plus one private aggregate repository;
- exposes private repository details;
- claims that the GitHub migration is already applied;
- authorizes deletion, archive, transfer, or automatic retirement;
- removes the exact-import, compatibility, test, consumer, redirect, rollback,
  or human-approval gates.

## Activation gate

Each source remains a separately observable GitHub repository until its target
contains the exact source history or an approved replacement, compatibility is
tested, consumers are accounted for, target CI passes, redirect and rollback
paths are proven, and the owner approves the specific repository-setting
operation. Local green tests validate this plan only; they do not activate it.

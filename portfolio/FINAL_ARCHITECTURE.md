# Final portfolio architecture — A01 prepared arbitration

Status: **PREPARED**. Activation remains a separate human decision.

This document resolves the apparent conflict between the current 18-target registry and the recommended final portfolio. They represent two different states, not two competing truths.

## Current safe state

`portfolio/targets.json` remains the operational review registry with 18 targets while migrations are incomplete. Keeping a transitional identity in that registry does **not** mean it is approved as a permanent standalone product.

The 18-target state exists so compatibility, consumer, redirect, rollback, and source-history evidence can be reviewed without prematurely removing a source or target identity.

## Final state

The prepared final architecture contains **16 entities backed by 17 active repositories**. `portfolio-profile` intentionally uses two repositories: `portfolio-kit` for the generated portfolio product and `vigilanty0x` for the GitHub profile entry point.

The machine-readable decision is `portfolio/final-architecture.json`.

Final entities:

1. `community-governance` → `.github`
2. `ai-assistance-manifest` → `ai-assistance-manifest`
3. `ai-software-factory` → `ai-software-factory`
4. `apprentice-ai` → `apprentice-ai` — standalone flagship
5. `agentops` → `automation-control-plane`
6. `contract-lab` → `contract-lab`
7. `devdocs` → `devdocs`
8. `local-ai-stack` → `local-ai-stack`
9. `model-router` → `model-router`
10. `portfolio-profile` → `portfolio-kit` + `vigilanty0x`
11. `promptops` → `promptops`
12. `proofgate` → `proofgate`
13. `rag-lab` → `rag-lab`
14. `repo-doctor` → `repo-doctor`
15. `shipcheck` → `shipcheck`
16. `trustkit` → `trustkit`

## Prepared absorptions

The following product identities are transitional, not final standalone entities:

- `agent-dashboard` → AgentOps
- `agent-handoff` → AgentOps
- `agent-worktrees` → AgentOps
- `safe-merge-gate` → Shipcheck
- `shipcheck-release-gate` → Shipcheck

Absorption means migration behind compatibility contracts. It does not authorize deletion, redirection, release, or archive.

## Activation gate

The final 16-entity state may replace the 18-target transitional registry only when every affected transition has all required proof:

- current source and target SHAs;
- source-history import or an explicitly documented replacement path;
- compatibility for old package/import/CLI contracts;
- live consumer inventory and migrated-consumer evidence;
- target release evidence;
- redirect/deprecation evidence where applicable;
- a real rollback rehearsal bound to migration SHAs;
- explicit named human approval.

Until then, affected identities remain active and unarchived. A green rehearsal or an older successful CI run never substitutes for the current-head gate.

## Archive boundary

The final plan has 95 eventual archive candidates. **None is automatically archivable.** Archive remains blocked unless release, compatibility, consumers, redirect, rollback, and human-approval gates all pass.

## Public/private boundary

This decision is for the public portfolio only. Private-product data, secrets, customer information, private prompts, and production data are outside this document and outside the portfolio collector.

# Pull-request triage

## Categories and order

1. `SECURITY` — vulnerabilities, secret exposure, or public-boundary failures.
2. `CONSOLIDATION` — import, migration, rehearsal, or target assembly.
3. `RELEASE` — version, tag, changelog, artefact, provenance, or publication work.
4. `DEPENDABOT` — automated dependency proposals.
5. `SUPERSEDED_CANDIDATE` — useful work on a source that may belong in a target.
6. `REVIEW` — everything else.

Classification is advisory. It never closes or merges a pull request.

## Ready for review

A consolidation is ready only when it has:

- one target and a bounded source set;
- source HEAD and tree hashes;
- collision and duplicate report;
- tests and negative tests;
- public-boundary result;
- compatibility plan;
- rollback procedure;
- reviewer capacity.

Draft status is preserved until those fields are present. Changing a draft to ready is not a release signal.

## Supersession

A source pull request can be closed as superseded only after a human confirms that:

1. the change is unnecessary, or its useful part is ported to the target;
2. the target branch contains the replacement;
3. the closure comment links the replacement evidence;
4. no security fix is lost;
5. rollback remains possible.

The policy explicitly disables automatic closure and automatic merge.

## Transitional 18-target registry versus final 16-entity architecture

The 18-target `targets.json` registry is a **safe transitional review state**. It must not be read as approval for 18 permanent product identities. The prepared end state is defined by `portfolio/final-architecture.json` and `portfolio/FINAL_ARCHITECTURE.md`: 16 entities backed by 17 active repositories.

During the transition:

- `agent-dashboard`, `agent-handoff`, and `agent-worktrees` may be reviewed only as bounded source/product rehearsals feeding the final AgentOps entity; they are not final standalone portfolio products;
- `safe-merge-gate` and `shipcheck-release-gate` feed the final Shipcheck entity and remain active until compatibility, consumers, release, redirect, rollback, and human gates pass;
- `apprentice-ai` remains a standalone final entity;
- no target is removed from the transitional registry merely to make the target count look finished.

## Recommended consolidation order

Review capacity remains capped at two active consolidations. Prefer bounded transitions whose source set and rollback can be proven completely. The program-level order is:

1. finish the current governance decision and keep the freeze enforceable;
2. AgentOps and Shipcheck identity consolidation;
3. Repo Doctor and ProofGate;
4. PromptOps and RAG Lab;
5. TrustKit and Contract Lab;
6. DevDocs and Portfolio/Profile;
7. Local AI Stack and AI Software Factory;
8. AI Assistance Manifest and Model Router;
9. standalone Apprentice AI release hardening.

This order is a review queue, not permission to exceed WIP=2. A later wave cannot claim completion from an older green run or from a rehearsal on a different SHA.

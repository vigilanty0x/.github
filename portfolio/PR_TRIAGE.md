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

## Transitional 18-target registry versus the concrete-six architecture

The 18-target `targets.json` registry is a **safe transitional review state**.
It must not be read as approval for 18 permanent product identities. The locally
prepared end state is defined by `portfolio/final-architecture.json` and
`portfolio/FINAL_ARCHITECTURE.md`: six product repositories and two public
support repositories covering 112/112 public source identities. One additional
private repository is represented only as an aggregate count, giving a
connected-account target of nine. This target is not yet applied on GitHub.

During the transition:

- `agent-dashboard`, `agent-handoff`, `agent-worktrees`, `apprentice-ai`, AI Software Factory, and Model Router feed Automation Control Plane;
- `safe-merge-gate` and `shipcheck-release-gate` feed Shipcheck;
- Local AI Stack feeds PromptOps while RAG Lab remains its own retrieval product;
- DevDocs and AI-assistance/provenance tooling feed Repo Doctor;
- TrustKit and Contract Lab feed ProofGate behind preserved package and CLI compatibility;
- Portfolio Kit and its three source tools feed profile support, while workflow templates feed `.github` support;
- no target is removed from the transitional registry merely to make the target count look finished.

## Recommended consolidation order

Review capacity remains capped at two active consolidations. Prefer bounded transitions whose source set and rollback can be proven completely. The program-level order is:

1. finish the current governance decision and keep the freeze enforceable;
2. Automation Control Plane source imports and compatibility;
3. Shipcheck source imports and compatibility;
4. Repo Doctor source imports and compatibility;
5. PromptOps and RAG Lab source imports, retaining two product identities;
6. ProofGate imports for TrustKit and Contract Lab;
7. `.github` and profile-support package verification;
8. cross-product consumer inventory, redirects, rollback rehearsals, and exact human approvals.

This order is a review queue, not permission to exceed WIP=2. A later wave cannot claim completion from an older green run or from a rehearsal on a different SHA.

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

## Recommended consolidation order

Begin with the smallest bounded targets: `ai-assistance-manifest`, `agent-handoff`, `agent-worktrees`, and `contract-lab`. Continue with `proofgate` and `portfolio-profile`. Large targets stay gated until review debt falls.

# Public portfolio control plane

This directory is the machine-readable source of truth for the public repositories owned by `vigilanty0x`.

It separates **prepared work** from **merged code**, **tags**, **published releases**, and **verified behavior**. A pull request, rehearsal branch, README title, or package version is not a release proof by itself.

The observed registry still contains 112 public repositories and 18 transitional
targets. [`final-architecture.json`](final-architecture.json) maps that complete
public universe exactly once into six product repositories and two support
repositories. Its connected-account target is nine only because it includes one
additional private repository as an aggregate count. The mapping is locally
prepared and explicitly does not claim that GitHub has already been migrated.

## Files

- `targets.json` — eighteen target products, one hundred source repositories, two standalone decision items, the complete expected public set of 112 repositories, and bounded archive readback receipts.
- `final-architecture.json` — exact 112-to-8 public destination mapping for six concrete products and two supports, with a nine-repository connected target and no private identifier.
- `FINAL_ARCHITECTURE.md` — human-readable product boundaries, counts, and activation gates for the locally prepared topology.
- `targets.schema.json` — declarative schema for the target registry.
- `actions.json` — P0/P1 action register with dependencies, counter-proofs, closure evidence, and rollback.
- `actions.schema.json` — declarative schema for the action register.
- `freeze.json` — stop-the-line limits during consolidation.
- `triage-policy.json` — deterministic pull-request categories and supersession safeguards.
- `agentops-decision.json` — prepared base decision and module map for the missing AgentOps target.
- `STATE_MACHINE.md` — legal target/source transitions and evidence semantics.
- `FREEZE.md` — operational freeze rules.
- `PR_TRIAGE.md` — review order and supersession workflow.
- `RELEASE_POLICY.md` — release and archive gates.

## Validation

```bash
node scripts/check-portfolio.mjs --root .
node scripts/check-final-architecture.mjs \
  portfolio/final-architecture.json portfolio/targets.json
node --test test/*.test.mjs
```

The validators are deliberately fail-closed. They reject duplicate or missing
source membership, incorrect concrete-product routing, contradictory release
claims, stale evidence, unapproved waivers, invalid state transitions, premature
GitHub-migration claims, and any deletion authorization. An archive may lack
mandatory gates only when an exact, repository-scoped `OBSERVED_NONCOMPLIANT`
server readback records an already-existing condition; that receipt must keep
compliance blocked and cannot satisfy or waive any retirement gate.

## Live evidence

The read-only collector compares the registry with GitHub and produces JSON plus Markdown:

```bash
GITHUB_TOKEN=... node scripts/live-portfolio.mjs \
  --strict \
  --output-json snapshot.json \
  --output-markdown snapshot.md
```

Strict mode stops the line when repository coverage drifts, an expected archive or its recorded head/homepage/open-PR state drifts, the pull-request backlog exceeds policy, active consolidations exceed review capacity, or live data cannot be collected. It does not close, merge, archive, publish, or modify repositories.

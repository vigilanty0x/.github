# Public portfolio control plane

This directory is the machine-readable source of truth for the public repositories owned by `vigilanty0x`.

It separates **prepared work** from **merged code**, **tags**, **published releases**, and **verified behavior**. A pull request, rehearsal branch, README title, or package version is not a release proof by itself.

## Files

- `targets.json` — eighteen target products, one hundred source repositories, two standalone decision items, and the complete expected public set of 112 repositories.
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
node --test test/*.test.mjs
```

The validator is deliberately fail-closed. It rejects duplicate membership, contradictory release claims, stale evidence, unapproved waivers, invalid state transitions, and any archive state lacking every required gate.

## Live evidence

The read-only collector compares the registry with GitHub and produces JSON plus Markdown:

```bash
GITHUB_TOKEN=... node scripts/live-portfolio.mjs \
  --strict \
  --output-json snapshot.json \
  --output-markdown snapshot.md
```

Strict mode stops the line when repository coverage drifts, the pull-request backlog exceeds policy, active consolidations exceed review capacity, or live data cannot be collected. It does not close, merge, archive, publish, or modify repositories.

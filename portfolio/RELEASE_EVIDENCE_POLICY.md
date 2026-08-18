# Release evidence policy

This policy defines what the public portfolio means by a **stable release evidence candidate**. It does not publish anything by itself.

A stable candidate must bind one exact commit to all of the following:

- a protected release environment;
- one or more installable artifacts with SHA-256 digests;
- an SBOM file with its own digest;
- a provenance file whose subject commit is the exact candidate commit;
- trusted publishing using the declared OIDC policy, with no long-lived publishing token;
- post-publication verification on the exact commit;
- artifact digest verification after publication;
- an installed-artifact smoke after publication.

The machine-readable policy is `portfolio/release-evidence-policy.json`. `scripts/check-release-evidence.mjs` is the fail-closed validator. The committed candidate under `portfolio/fixtures/` is explicitly synthetic and exists only to prove that the gate accepts a complete record and rejects missing or contradictory evidence.

## State semantics

The governance policy itself can be **PREPARED** and tested without claiming a product release. A real target remains `BLOCKED` or `PREPARED` until its product owner supplies a current, non-synthetic release candidate bound to its real commit, artifacts, publication environment and post-publication checks.

This keeps the responsibilities separate: A01 defines and verifies the common release evidence contract; product/release owners produce real release evidence for their targets.

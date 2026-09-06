# Vigilanty0x community health and CI defaults

This special repository defines evidence-first contribution defaults for the
public portfolio. It provides community files, issue forms, pull-request
requirements, reusable CI, and starter workflows.

The defaults do not turn an unmeasured control into a passing control. Each
project still owns its runtime-specific tests, threat model, release process,
and residual-risk statement.

## Prepared concrete-six portfolio

The versioned files in `portfolio/` preserve the observed 18-target review
registry and define a new canonical destination map for all **112 public
repositories**:

| Concrete product | Assigned public repositories |
|---|---:|
| `automation-control-plane` | 23 |
| `promptops` | 15 |
| `rag-lab` | 10 |
| `shipcheck` | 15 |
| `repo-doctor` | 26 |
| `proofgate` | 16 |

Two support repositories complete the public topology: `.github` covers itself
and `workflow-templates`, while `vigilanty0x` covers the profile, Portfolio Kit,
build metrics, and both profile/portfolio generators. The complete mapping is
[`portfolio/final-architecture.json`](portfolio/final-architecture.json).

This is **local preparation**, not a completed GitHub migration. The prepared
destination is eight public repositories plus one private repository represented
only by an aggregate count, for a connected-account target of nine. No private
repository identifier is part of the public registry. No deletion, archive,
transfer, redirect, or automatic repository mutation is authorized.

The registry keeps `PREPARED`, `MERGED`, `TAGGED`, `RELEASED`, and `VERIFIED`
separate. It blocks planned source archives unless decision, exact import,
compatibility, release, consumers, redirect, rollback, and repository-scoped
human approval all pass. A bounded `OBSERVED_NONCOMPLIANT` receipt may record an
archive already observed on GitHub, but it keeps the target and failed gates
blocked and never authorizes another archive.

Validate the local truth model and its counter-proofs with:

```bash
python scripts/check_monorepo.py
node scripts/check-portfolio.mjs --root .
node scripts/check-governance.mjs --root .
node scripts/check-final-architecture.mjs \
  portfolio/final-architecture.json portfolio/targets.json
node --test test/*.test.mjs
```

The scheduled `Public portfolio live evidence` workflow reads GitHub repository,
pull-request, check, and mergeability state, compares it with the registry, and
publishes a bounded Markdown report in the Actions job summary. For registered
archive receipts it also reconciles archive state, default-branch head,
homepage redirect, and open pull requests. Strict mode stops the line on drift,
expired evidence, excessive review load, stale drafts, failing CI, or conflicts.
The collector has read-only permissions and contains no merge, close, archive,
release, or repository mutation path.

## Reusable workflows

Call reusable workflows from a commit SHA or a protected release tag:

- `.github/workflows/reusable-python.yml`
- `.github/workflows/reusable-node.yml`

The Python workflow tests the declared version matrix, builds both sdist and
wheel, installs them independently, compares installed package metadata, and can
run a product-specific smoke command against both artefacts. The Node workflow
tests the declared LTS matrix, packs the package, installs it in a clean project,
and can run a product-specific installed-package smoke command.

Consumers must add their own negative, integration, and end-to-end checks when
the product contract requires them.

## Public-data boundary

Examples and fixtures must be synthetic. Customer identifiers, credentials,
internal prompts, non-public endpoints, and production-derived datasets are not
accepted. The policy check uses a one-way marker digest and never logs a matched
value.

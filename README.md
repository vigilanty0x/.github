# Vigilanty0x community health and CI defaults

This special repository defines evidence-first contribution defaults for the
public portfolio. It provides community files, issue forms, pull-request
requirements, reusable CI, and starter workflows.

The defaults do not turn an unmeasured control into a passing control. Each
project still owns its runtime-specific tests, threat model, release process,
and residual-risk statement.

## Public portfolio control plane

The versioned files in `portfolio/` are the canonical public-only registry for
eighteen target products, one hundred original source repositories, two
standalone decision items, and the complete expected set of 112 public
repositories.

The registry keeps `PREPARED`, `MERGED`, `TAGGED`, `RELEASED`, and `VERIFIED`
separate. It also blocks source archive states unless decision, exact import,
compatibility, release, consumers, redirect, rollback, and named human approval
all pass.

Validate the local truth model and its counter-proofs with:

```bash
node scripts/check-portfolio.mjs --root .
node scripts/check-governance.mjs --root .
node --test test/*.test.mjs
```

The scheduled `Public portfolio live evidence` workflow reads GitHub repository,
pull-request, check, and mergeability state, compares it with the registry, and
publishes a bounded Markdown report in the Actions job summary. Strict mode
stops the line on drift, expired evidence, excessive review load, stale drafts,
failing CI, or conflicts. The collector has read-only permissions and contains
no merge, close, archive, release, or repository mutation path.

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

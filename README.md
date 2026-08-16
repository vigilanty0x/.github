# Vigilanty0x community health and CI defaults

This special repository defines evidence-first contribution defaults for the
public portfolio. It provides community files, issue forms, pull-request
requirements, reusable CI, and starter workflows.

The defaults do not turn an unmeasured control into a passing control. Each
project still owns its runtime-specific tests, threat model, release process,
and residual-risk statement.

## Reusable workflows

Call reusable workflows from a commit SHA or a protected release tag:

- `.github/workflows/reusable-python.yml`
- `.github/workflows/reusable-node.yml`

Consumers must add their own negative, integration, and end-to-end checks when
the product contract requires them.

## Public-data boundary

Examples and fixtures must be synthetic. Customer identifiers, credentials,
internal prompts, non-public endpoints, and production-derived datasets are not
accepted. The policy check uses a one-way marker digest and never logs a matched
value.


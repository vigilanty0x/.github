# Release, redirect, and archive policy

## Release semantics

A version string in code or documentation is not a published release. A stable claim requires one commit linked to:

- a signed or otherwise protected tag;
- a GitHub Release;
- wheel/sdist, package, binary, or other installable artefact as applicable;
- artefact SHA-256 digests;
- clean-environment smoke tests;
- SBOM and provenance for stable releases;
- changelog and migration notes;
- post-publication verification.

The registry uses `NOT_RELEASED`, `PREPARED`, `TAGGED`, `RELEASED`, and `VERIFIED` so that preparation is never presented as delivery.

## Compatibility

Renames require tested aliases, shims, schemas, configuration namespaces, command options, and a documented end date. Old and new identities must be exercised by the same contract tests during the compatibility window.

## Consumers

Before deprecation or archive, scan imports, package references, reusable workflows, links, examples, documentation, and GitHub dependants. A newly discovered consumer returns the archive gate to `BLOCKED` until migrated or explicitly supported.

## Redirect and deprecation

A source repository must publish:

- a deprecation notice at the top of its README;
- the canonical replacement and migration command;
- a final supported version or tag;
- support end date;
- security reporting path;
- verified links.

## Rollback

Rollback is an executable drill, not a sentence. It must restore the previous supported source or target, reverse redirects when necessary, and preserve evidence. A failed or stale drill blocks archive.

## Human gate

No source archive, stable release, or freeze removal is automatic. The registry records approver, time, rationale, and the exact SHA reviewed.

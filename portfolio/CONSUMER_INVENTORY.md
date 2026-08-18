# Public consumer inventory

The portfolio consumer inventory is a read-only, current-default-branch scan of every repository registered in `targets.json`.

It records exact repository HEAD SHAs and searches regular text files for four bounded reference classes:

- GitHub repository references and links;
- reusable workflow `uses:` references;
- package-manifest references;
- common Python and JavaScript import forms.

The report contains repository names, paths, line numbers, public tokens, counts, errors, evidence TTL, and SHA-256 digests. It intentionally never emits source-line snippets or arbitrary matched content.

The scanner does not follow symbolic links, inspect Git history, private repositories, third-party repositories, runtime-generated references, or every dynamic language import mechanism. Those limits are explicit in every report.

A `PASS` means that all 112 registered public default-branch trees were materialized and scanned under the documented rules. It does not prove that consumers were migrated, that compatibility is preserved, or that any source may be deprecated or archived.

## Current exact evidence

The A01 closure run on head `07260df8cdf41c7711bd9e74901d0f60fc79cbf7` produced **PASS** at `2026-08-18T17:22:58.124Z` and expires at `2026-09-17T17:22:58.124Z`.

- workflow run: `32165272798`;
- artifact id: `9335162364`;
- artifact digest: `sha256:93fe77ac52efc3e35e8a61e55b50cb871c4a03b53c35eb73ea8f252bf3b3246f`;
- registry SHA-256: `37b86504b6b7a34bfe4d5b27504c16aebf914d52f4c94496b25fe9c923583c0f`;
- evidence SHA-256: `150b783f18c5a6b3537a455a80cb6d141401c9d2730bf00ac22e100a95ec485b`;
- snapshot SHA-256: `22eef20b7ba8428f187e66c938110208086d92d9a0af7968d600e6e015e28194`;
- registered/scanned repositories: **112/112**;
- text files scanned: **2,225**;
- references: **1,223**;
- providers with observed consumers: **67**;
- providers without observed consumers: **45**;
- errors: **0**.

This closes the bounded **public-portfolio inventory** action. It does not erase the report's limitations and does not authorize a redirect or archive. A later discovered consumer returns the corresponding target gate to `BLOCKED`.

## Reproduce locally

Create a workspace containing one directory per repository and a `.consumer-head` file with the exact 40-character checkout SHA in every directory, then run:

```bash
node scripts/consumer-inventory.mjs \
  --root . \
  --workspace /path/to/workspace \
  --strict \
  --output-json consumer-live/snapshot.json \
  --output-markdown consumer-live/snapshot.md \
  --output-manifest consumer-live/manifest.json
```

The scheduled GitHub Actions workflow performs public, unauthenticated, read-only shallow clones. It retries boundedly, records clone failures as missing evidence, uploads only the bounded reports, and fails closed on incomplete materialization, registry drift, expired registry evidence, malformed manifests, or scan errors.

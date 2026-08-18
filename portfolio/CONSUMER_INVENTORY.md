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

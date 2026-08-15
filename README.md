# Workflow Templates

## Purpose

Bounded DAG workflow templates with safe non-structural variable substitution. The package is standard-library-only and designed for deterministic local use with synthetic or caller-controlled JSON.

## Non-goals

It does not execute steps, evaluate expressions, fetch remote templates, or provide a general templating language.

## Install

Requires Python 3.11 or newer.

```bash
python -m pip install .
```

## CLI and API

Pass a JSON object by path or standard input. Success is emitted as machine-readable JSON; validation failures return exit status 2 without a traceback.

```bash
workflow-templates examples/basic.json
python -m workflow_templates.cli examples/basic.json
```

The public API is `workflow_templates.core.run(data)`. Lower-level functions remain available for focused library use; inspect their signatures for supported keyword options.

## Example

The example substitutes a synthetic message in a two-step acyclic workflow.

```bash
workflow-templates examples/basic.json
```

All example content is synthetic and safe to publish.

## Security and trust model

Variables are forbidden in step IDs and dependencies. Template and variable sizes are bounded, substitution is recursive only in non-structural values, and the complete result is revalidated as a DAG.

The caller remains responsible for authenticating inputs and enforcing returned decisions at the real I/O or authorization boundary. Invalid and inconclusive inputs fail visibly rather than producing a healthy or verified claim.

## Limitations

Variables are finite JSON scalars rendered as strings. Domain-specific step schemas require separate validation.

## Tests

Run the full local contract:

```bash
python -m unittest discover -s tests -v
python scripts/check.py
python -m build --no-isolation
```

CI exercises Python 3.11 and 3.12, builds and installs the wheel, then runs tests, the public-boundary check, the module example, and the installed console command.

## AI assistance

AI-assisted contribution details and validation expectations are documented in [AI_ASSISTANCE.md](AI_ASSISTANCE.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).


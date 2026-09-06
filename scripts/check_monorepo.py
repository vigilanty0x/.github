from __future__ import annotations

import json
import re
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "MONOREPO.json"
SHA = re.compile(r"^[0-9a-f]{40}$")
EXPECTED_TARGET = "vigilanty0x/.github"
EXPECTED_SOURCES = {
    "vigilanty0x/.github": ("KEEP", "."),
    "vigilanty0x/workflow-templates": ("ABSORB", "packages/workflow-templates"),
}


def fail(message: str) -> None:
    raise SystemExit(f"monorepo manifest: {message}")


def main() -> None:
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(str(exc))

    if data.get("schema_version") != 1:
        fail("schema_version must be 1")
    if data.get("status") != "LOCAL_PREPARATION":
        fail("status must remain LOCAL_PREPARATION until GitHub migration is verified")
    if data.get("github_migration_state") != "NOT_APPLIED":
        fail("github_migration_state must remain NOT_APPLIED")
    if data.get("delete_authorized") is not False:
        fail("source deletion must remain explicitly unauthorized")

    target = data.get("target")
    if not isinstance(target, dict):
        fail("target must be an object")
    if target.get("kind") != "SUPPORT" or target.get("repository") != EXPECTED_TARGET:
        fail(f"target must be the {EXPECTED_TARGET} support repository")
    sources = target.get("sources")
    if not isinstance(sources, list) or len(sources) != len(EXPECTED_SOURCES):
        fail(f"target.sources must contain exactly {len(EXPECTED_SOURCES)} entries")

    seen: set[str] = set()
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            fail(f"source {index} must be an object")
        repository = source.get("repository")
        if not isinstance(repository, str) or repository.count("/") != 1:
            fail(f"source {index} has an invalid repository")
        if repository in seen:
            fail(f"duplicate source {repository}")
        seen.add(repository)
        if repository not in EXPECTED_SOURCES:
            fail(f"unexpected source {repository}")

        expected_disposition, expected_path = EXPECTED_SOURCES[repository]
        if source.get("disposition") != expected_disposition:
            fail(f"{repository} disposition must be {expected_disposition}")

        metadata = source.get("source")
        if not isinstance(metadata, dict):
            fail(f"{repository} has no source metadata")
        if not SHA.fullmatch(str(metadata.get("head", ""))):
            fail(f"{repository} has an invalid source head")
        if not SHA.fullmatch(str(metadata.get("tree", ""))):
            fail(f"{repository} has an invalid source tree")
        if metadata.get("visibility") != "PUBLIC":
            fail(f"{repository} must remain inside the public support boundary")
        if metadata.get("default_branch") != "main" or metadata.get("archived") is not False:
            fail(f"{repository} source metadata must bind the active main branch")

        raw_path = source.get("target_path")
        if not isinstance(raw_path, str) or "\\" in raw_path:
            fail(f"{repository} has an invalid target path")
        pure = PurePosixPath(raw_path)
        if pure.is_absolute() or ".." in pure.parts:
            fail(f"{repository} target path escapes the repository")
        if raw_path != expected_path:
            fail(f"{repository} target path must be {expected_path}")
        local = ROOT if raw_path == "." else ROOT.joinpath(*pure.parts)
        if not local.exists():
            fail(f"{repository} target path is missing: {raw_path}")

    if seen != set(EXPECTED_SOURCES):
        fail("source set does not match the two-repository GitHub support contract")

    print(f"monorepo manifest: {len(sources)} sources mapped for {target['repository']}")


if __name__ == "__main__":
    main()

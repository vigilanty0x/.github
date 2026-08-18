import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildInventory, deriveRegisteredRepositories } from "../scripts/consumer-inventory.mjs";

const NOW = new Date("2026-08-18T12:00:00Z");

function registry({ expiresAt = "2026-09-18T00:00:00Z", expected = 4 } = {}) {
  return {
    owner: "vigilanty0x",
    observedAt: "2026-08-18T00:00:00Z",
    expiresAt,
    expectedPublicRepositoryCount: expected,
    targets: [
      {
        id: "alpha",
        canonicalRepository: "alpha-suite",
        companionRepositories: [],
        sources: [
          { repository: "alpha-suite", role: "TARGET", state: "ACTIVE_TARGET" },
          { repository: "alpha-lib", role: "SOURCE", state: "ACTIVE_SOURCE" },
        ],
      },
    ],
    standaloneRepositories: [
      { repository: "consumer-app" },
      { repository: ".github" },
    ],
  };
}

async function fixture(options = {}) {
  const workspace = await mkdtemp(join(tmpdir(), "consumer-inventory-"));
  for (const [index, repository] of ["alpha-suite", "alpha-lib", "consumer-app", ".github"].entries()) {
    await mkdir(join(workspace, repository), { recursive: true });
    await writeFile(join(workspace, repository, ".consumer-head"), `${String(index + 1).repeat(40).slice(0, 40)}\n`);
  }
  await writeFile(join(workspace, "alpha-lib", "pyproject.toml"), '[project]\nname = "alpha-lib"\n');
  await mkdir(join(workspace, "alpha-lib", "src", "alpha_lib"), { recursive: true });
  await writeFile(join(workspace, "alpha-lib", "src", "alpha_lib", "__init__.py"), "");
  await mkdir(join(workspace, "consumer-app", "src"), { recursive: true });
  await writeFile(join(workspace, "consumer-app", "src", "main.py"), "from alpha_lib import run\n");
  await writeFile(join(workspace, "consumer-app", "pyproject.toml"), '[project]\nname = "consumer-app"\ndependencies = ["alpha-lib"]\n');
  await mkdir(join(workspace, "consumer-app", ".github", "workflows"), { recursive: true });
  await writeFile(
    join(workspace, "consumer-app", ".github", "workflows", "ci.yml"),
    "steps:\n  - uses: vigilanty0x/alpha-lib/.github/workflows/ci.yml@0123456789012345678901234567890123456789\n",
  );
  await writeFile(join(workspace, "consumer-app", "README.md"), "See https://github.com/vigilanty0x/alpha-lib\n");
  await mkdir(join(workspace, ".github", "portfolio"), { recursive: true });
  await writeFile(join(workspace, ".github", "portfolio", "targets.json"), JSON.stringify(registry(options)));
  return workspace;
}

async function snapshot(workspace, options = {}) {
  const document = registry(options);
  return buildInventory({
    registry: document,
    registryBytes: Buffer.from(JSON.stringify(document)),
    workspace,
    now: NOW,
  });
}

test("derives the complete registered repository set without duplicates", () => {
  const repositories = deriveRegisteredRepositories(registry());
  assert.deepEqual(repositories.map((entry) => entry.repository), [".github", "alpha-lib", "alpha-suite", "consumer-app"]);
  assert.deepEqual(repositories.find((entry) => entry.repository === "alpha-lib")?.targetIds, ["alpha"]);
});

test("finds code imports, manifests, reusable workflows, and repository links", async () => {
  const workspace = await fixture();
  const report = await snapshot(workspace);
  assert.equal(report.status, "PASS");
  assert.equal(report.complete, true);
  const references = report.references.filter(
    (entry) => entry.providerRepository === "alpha-lib" && entry.consumerRepository === "consumer-app",
  );
  assert.deepEqual(new Set(references.map((entry) => entry.kind)), new Set([
    "CODE_IMPORT",
    "PACKAGE_REFERENCE",
    "WORKFLOW_USE",
    "REPOSITORY_LINK",
  ]));
  const provider = report.consumers.find((entry) => entry.repository === "alpha-lib");
  assert.equal(provider.consumerCount, 1);
  assert.deepEqual(provider.consumers, ["consumer-app"]);
  assert.match(report.evidenceSha256, /^[0-9a-f]{64}$/);
});

test("does not turn the canonical governance registry into fake consumer evidence", async () => {
  const workspace = await fixture();
  const report = await snapshot(workspace);
  assert.equal(report.references.some((entry) => entry.consumerRepository === ".github"), false);
});

test("does not emit matched source lines or unrelated secret values", async () => {
  const workspace = await fixture();
  await writeFile(
    join(workspace, "consumer-app", "src", "main.py"),
    'from alpha_lib import run\nPRIVATE_SAMPLE_VALUE = "do-not-emit-this-value"\n',
  );
  const report = await snapshot(workspace);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("do-not-emit-this-value"), false);
  assert.equal(report.references.every((entry) => !("snippet" in entry) && !("content" in entry)), true);
});

test("fails closed when a registered repository is absent", async () => {
  const workspace = await fixture();
  await rm(join(workspace, "alpha-lib"), { recursive: true, force: true });
  const report = await snapshot(workspace);
  assert.equal(report.status, "FAIL");
  assert.equal(report.complete, false);
  assert.ok(report.errors.some((entry) => entry.code === "MISSING_REPOSITORY"));
  assert.ok(report.errors.some((entry) => entry.code === "REPOSITORY_COUNT_DRIFT"));
});

test("fails closed when canonical registry evidence is expired", async () => {
  const workspace = await fixture({ expiresAt: "2026-08-18T11:59:59Z" });
  const report = await snapshot(workspace, { expiresAt: "2026-08-18T11:59:59Z" });
  assert.equal(report.status, "FAIL");
  assert.ok(report.errors.some((entry) => entry.code === "REGISTRY_EXPIRED"));
});

test("records but never follows symbolic links", async () => {
  const workspace = await fixture();
  const outside = join(workspace, "outside.txt");
  await writeFile(outside, "vigilanty0x/alpha-lib\n");
  try {
    await symlink(outside, join(workspace, "consumer-app", "linked.txt"));
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return;
    throw error;
  }
  const report = await snapshot(workspace);
  assert.equal(report.status, "PASS");
  assert.equal(report.counts.skippedSymlinkCount, 1);
  assert.equal(report.references.some((entry) => entry.path === "linked.txt"), false);
});

test("evidence digest is deterministic for the same bounded observation", async () => {
  const workspace = await fixture();
  const first = await snapshot(workspace);
  const second = await snapshot(workspace);
  assert.equal(first.evidenceSha256, second.evidenceSha256);
});

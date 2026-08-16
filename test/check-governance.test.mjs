import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { check } from "../scripts/check-governance.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "governance-check-"));
  for (const file of ["README.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md", "SUPPORT.md", "CODE_OF_CONDUCT.md"]) {
    await writeFile(join(root, file), "synthetic\n");
  }
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "CODEOWNERS"), "* @owner\n");
  return root;
}

test("passes a pinned least-privilege workflow", async () => {
  const root = await fixture();
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n");
  assert.equal((await check(root)).status, "PASS");
});

test("fails on a mutable action", async () => {
  const root = await fixture();
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@v4\n");
  const report = await check(root);
  assert.equal(report.status, "FAIL");
  assert.ok(report.findings.some((finding) => finding.rule === "mutable-action"));
});

test("detects the excluded marker by digest without emitting it", async () => {
  const root = await fixture();
  const marker = ["S", "K", "Y", "O", "M"].join("");
  await writeFile(join(root, "fixture.txt"), `${marker}\n`);
  const report = await check(root);
  assert.equal(report.status, "FAIL");
  assert.ok(report.findings.some((finding) => finding.rule === "public-boundary"));
  assert.equal(JSON.stringify(report).includes(marker), false);
  assert.equal(report.valuesIncluded, false);
});

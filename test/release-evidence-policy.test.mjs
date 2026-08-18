import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { validateReleaseEvidence } from "../scripts/check-release-evidence.mjs";

const policy = JSON.parse(fs.readFileSync("portfolio/release-evidence-policy.json", "utf8"));
const baseline = JSON.parse(fs.readFileSync("portfolio/fixtures/release-candidate.synthetic.json", "utf8"));
const clone = () => structuredClone(baseline);

function reject(mutator, pattern) {
  const candidate = clone();
  mutator(candidate);
  const errors = validateReleaseEvidence(candidate, policy);
  assert.ok(errors.some((error) => pattern.test(error)), errors.join(" | "));
}

test("synthetic release candidate satisfies the prepared governance policy", () => {
  assert.deepEqual(validateReleaseEvidence(baseline, policy), []);
});

test("counter-proof: missing SBOM blocks the release evidence gate", () => {
  reject((candidate) => { candidate.sbom = null; }, /SBOM/);
});

test("counter-proof: missing provenance blocks the release evidence gate", () => {
  reject((candidate) => { candidate.provenance = null; }, /provenance/);
});

test("counter-proof: invalid artifact digest blocks the release evidence gate", () => {
  reject((candidate) => { candidate.artifacts[0].sha256 = "bad"; }, /artifact.*SHA-256/);
});

test("counter-proof: long-lived publishing credentials are rejected", () => {
  reject((candidate) => { candidate.publishing.longLivedTokenUsed = true; }, /long-lived/);
});

test("counter-proof: unprotected publishing environments are rejected", () => {
  reject((candidate) => { candidate.publishing.environmentProtected = false; }, /environment must be protected/);
});

test("counter-proof: provenance cannot point at another commit", () => {
  reject((candidate) => { candidate.provenance.subjectCommit = "e".repeat(40); }, /provenance subject/);
});

test("counter-proof: post-publication verification must bind the exact commit", () => {
  reject((candidate) => { candidate.postPublication.checkedCommit = "f".repeat(40); }, /exact candidate commit/);
});

test("counter-proof: a missing post-publication install smoke blocks the gate", () => {
  reject((candidate) => { candidate.postPublication.installSmokePassed = false; }, /install smoke/);
});

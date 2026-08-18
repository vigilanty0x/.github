import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const baseline = JSON.parse(fs.readFileSync("portfolio/a01-pr-triage-closure.json", "utf8"));
const SHA40 = /^[0-9a-f]{40}$/;
const EXPECTED_REPOSITORIES = new Set([
  ".github",
  "vigilanty0x",
  "portfolio-kit",
  "devdocs",
  "open-source-portfolio-generator",
  "github-profile-dashboard",
  "build-metrics-collector",
  "codebase-onboarding-guide-generator",
  "document-factory",
  "event-log-explorer",
  "failure-postmortem-kit",
  "runbook-builder",
  "state-machine-visualizer",
  "system-map-generator",
]);

function validate(record) {
  const errors = [];
  if (record?.schemaVersion !== 1) errors.push("schemaVersion");
  if (record?.scope !== "A01_PUBLIC_ONLY") errors.push("scope");
  if (record?.status !== "VERIFIED_ZERO_OPEN_PRS") errors.push("status");
  if (record?.openPullRequestCount !== 0) errors.push("openPullRequestCount");

  const repositories = Array.isArray(record?.repositoriesChecked) ? record.repositoriesChecked : [];
  if (repositories.length !== EXPECTED_REPOSITORIES.size || new Set(repositories).size !== EXPECTED_REPOSITORIES.size || [...EXPECTED_REPOSITORIES].some((repo) => !repositories.includes(repo))) {
    errors.push("repositoriesChecked");
  }

  const closures = Array.isArray(record?.supersededClosures) ? record.supersededClosures : [];
  if (closures.length !== 3) errors.push("supersededClosures-count");
  for (const closure of closures) {
    if (closure.repository !== "build-metrics-collector") errors.push("closure-repository");
    if (![2, 3, 4].includes(closure.pullRequest)) errors.push("closure-pr");
    if (closure.replacementRepository !== "portfolio-kit") errors.push("replacement-repository");
    if (!SHA40.test(closure.replacementMergeCommit ?? "")) errors.push("replacement-merge-sha");
    if (!SHA40.test(closure.replacementVerifiedHead ?? "")) errors.push("replacement-head-sha");
    if (!Number.isInteger(closure.replacementCiRun) || closure.replacementCiRun <= 0) errors.push("replacement-ci-run");
    if (closure.sourceArchived !== false) errors.push("sourceArchived");
    if (closure.redirectCreated !== false) errors.push("redirectCreated");
  }

  const policy = record?.closurePolicy ?? {};
  if (policy.usefulChangeMustBePortedFirst !== true) errors.push("port-first-policy");
  if (policy.replacementEvidenceRequired !== true) errors.push("replacement-evidence-policy");
  if (policy.automaticClosure !== false) errors.push("automaticClosure");
  if (policy.archiveAuthorized !== false) errors.push("archiveAuthorized");

  if (record?.remainingA01Blocker?.id !== "P1-007" || record?.remainingA01Blocker?.status !== "BLOCKED") errors.push("remainingA01Blocker");
  return errors;
}

const clone = () => structuredClone(baseline);

test("A01 PR triage closure receipt is internally consistent", () => {
  assert.deepEqual(validate(baseline), []);
});

test("counter-proof: any remaining A01 PR invalidates zero-open status", () => {
  const candidate = clone();
  candidate.openPullRequestCount = 1;
  assert.ok(validate(candidate).includes("openPullRequestCount"));
});

test("counter-proof: a source PR cannot be closed without target replacement evidence", () => {
  const candidate = clone();
  candidate.supersededClosures[0].replacementMergeCommit = null;
  assert.ok(validate(candidate).includes("replacement-merge-sha"));
});

test("counter-proof: source archive cannot be smuggled into PR triage", () => {
  const candidate = clone();
  candidate.supersededClosures[0].sourceArchived = true;
  assert.ok(validate(candidate).includes("sourceArchived"));
});

test("counter-proof: PR triage cannot become automatic closure", () => {
  const candidate = clone();
  candidate.closurePolicy.automaticClosure = true;
  assert.ok(validate(candidate).includes("automaticClosure"));
});

test("counter-proof: P1-007 remains an explicit blocker", () => {
  const candidate = clone();
  candidate.remainingA01Blocker.status = "VERIFIED";
  assert.ok(validate(candidate).includes("remainingA01Blocker"));
});

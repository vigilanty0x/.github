import assert from "node:assert/strict";
import test from "node:test";

import { checkPortfolio } from "../scripts/check-portfolio.mjs";
import { FIXED_NOW, createPortfolioFixture, readJson, writeJson } from "./helpers.mjs";

function hasRule(report, rule) {
  return report.findings.some((finding) => finding.rule === rule);
}

test("canonical public portfolio registry passes at its dated evidence time", async () => {
  const root = await createPortfolioFixture();
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "PASS", JSON.stringify(report.findings, null, 2));
  assert.deepEqual(report.counts, {
    targets: 18,
    sourceRepositories: 100,
    registeredPublicRepositories: 112,
    actions: 14,
  });
});

test("duplicate source membership fails closed", async () => {
  const root = await createPortfolioFixture();
  const registry = await readJson(root, "portfolio/targets.json");
  registry.targets[1].sources.push({ ...registry.targets[0].sources[1] });
  await writeJson(root, "portfolio/targets.json", registry);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "duplicate-source"), true);
});

test("expired registry and target evidence cannot support current truth", async () => {
  const root = await createPortfolioFixture();
  const report = await checkPortfolio(root, { now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "stale-registry"), true);
  assert.equal(hasRule(report, "stale-evidence"), true);
  assert.equal(hasRule(report, "stale-agentops-evidence"), true);
});

test("a fake verified target is rejected without every proof", async () => {
  const root = await createPortfolioFixture();
  const registry = await readJson(root, "portfolio/targets.json");
  registry.targets[0].status = "VERIFIED";
  registry.targets[0].release.status = "VERIFIED";
  await writeJson(root, "portfolio/targets.json", registry);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "target-verified-gate"), true);
  assert.equal(hasRule(report, "release-metadata"), true);
});

test("archive state is impossible while one mandatory gate is blocked", async () => {
  const root = await createPortfolioFixture();
  const registry = await readJson(root, "portfolio/targets.json");
  const target = registry.targets.find((candidate) => candidate.id === "proofgate");
  const source = target.sources.find((candidate) => candidate.role === "SOURCE");
  source.state = "ARCHIVED";
  source.sourceSha = "1".repeat(40);
  source.treeSha = "2".repeat(40);
  source.targetPath = "packages/source";
  source.importCommit = "3".repeat(40);
  await writeJson(root, "portfolio/targets.json", registry);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "archive-gate"), true);
  assert.equal(hasRule(report, "archive-target-state"), true);
});

test("waived human approval is always rejected", async () => {
  const root = await createPortfolioFixture();
  const registry = await readJson(root, "portfolio/targets.json");
  const target = registry.targets[0];
  target.gates.humanApproval = "WAIVED";
  target.waivers.push({
    gate: "humanApproval",
    approver: "reviewer",
    approvedAt: "2026-08-18T10:00:00Z",
    expiresAt: "2026-08-20T10:00:00Z",
    rationale: "Temporary waiver intentionally used as a counter-proof.",
  });
  await writeJson(root, "portfolio/targets.json", registry);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "human-approval-waiver"), true);
});

test("verified action requires immutable closure evidence", async () => {
  const root = await createPortfolioFixture();
  const actions = await readJson(root, "portfolio/actions.json");
  actions.actions[0].status = "VERIFIED";
  actions.actions[0].closureEvidence = [];
  await writeJson(root, "portfolio/actions.json", actions);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "action-closure-evidence"), true);
});

test("AgentOps mapping must cover exactly the thirteen registered members", async () => {
  const root = await createPortfolioFixture();
  const decision = await readJson(root, "portfolio/agentops-decision.json");
  decision.moduleMapping.pop();
  await writeJson(root, "portfolio/agentops-decision.json", decision);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "agentops-membership-drift"), true);
  assert.equal(hasRule(report, "agentops-selected-base-count"), true);
});

test("automatic mutation safeguards cannot be weakened", async () => {
  const root = await createPortfolioFixture();
  const freeze = await readJson(root, "portfolio/freeze.json");
  const triage = await readJson(root, "portfolio/triage-policy.json");
  freeze.automaticMutation = true;
  triage.autoMerge = true;
  triage.supersession.closeAutomatically = true;
  await writeJson(root, "portfolio/freeze.json", freeze);
  await writeJson(root, "portfolio/triage-policy.json", triage);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "automatic-mutation"), true);
  assert.equal(hasRule(report, "triage-auto-merge"), true);
  assert.equal(hasRule(report, "supersession-auto-close"), true);
});


test("AgentOps contract rehearsal cannot masquerade as source-history import", async () => {
  const root = await createPortfolioFixture();
  const decision = await readJson(root, "portfolio/agentops-decision.json");
  decision.gates.sourceHistoryImport = "PASS";
  await writeJson(root, "portfolio/agentops-decision.json", decision);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "agentops-import-drift"), true);
});

test("AgentOps receipt digests fail closed", async () => {
  const root = await createPortfolioFixture();
  const decision = await readJson(root, "portfolio/agentops-decision.json");
  decision.receipts.inventory = "not-a-digest";
  await writeJson(root, "portfolio/agentops-decision.json", decision);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "string-pattern"), true);
});

test("AgentOps archived claim requires every irreversible gate", async () => {
  const root = await createPortfolioFixture();
  const decision = await readJson(root, "portfolio/agentops-decision.json");
  decision.gates.archive = "PASS";
  await writeJson(root, "portfolio/agentops-decision.json", decision);
  const report = await checkPortfolio(root, { now: FIXED_NOW });
  assert.equal(report.status, "FAIL");
  assert.equal(hasRule(report, "agentops-archive-gate"), true);
  assert.equal(hasRule(report, "agentops-archive-state"), true);
});

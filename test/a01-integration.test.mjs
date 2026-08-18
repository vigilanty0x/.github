import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const baseline = JSON.parse(fs.readFileSync("portfolio/a01-integration.json", "utf8"));
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REQUIRED_REPOSITORIES = new Set([".github", "vigilanty0x", "portfolio-kit", "devdocs"]);
const REQUIRED_ARCHIVE_GATES = new Set(["release", "compatibility", "consumers", "redirect", "rollback", "humanApproval"]);

function clone(value) { return structuredClone(value); }

function validate(record) {
  const errors = [];
  if (record?.schemaVersion !== 1) errors.push("schemaVersion");
  if (record?.scope !== "PUBLIC_ONLY") errors.push("scope");
  if (record?.owner !== "A01_GPT_5_6_SOL_1") errors.push("owner");
  if (record?.status !== "VERIFIED_SCOPE_COMPLETE") errors.push("status");

  const architecture = record?.architecture ?? {};
  if (architecture.transitionalTargetCount !== 18) errors.push("transitionalTargetCount");
  if (architecture.finalEntityCount !== 16) errors.push("finalEntityCount");
  if (architecture.finalActiveRepositoryCount !== 17) errors.push("finalActiveRepositoryCount");
  if (architecture.eventualArchiveCandidateCount !== 95) errors.push("eventualArchiveCandidateCount");
  if (architecture.activationRequiresHumanApproval !== true) errors.push("activationRequiresHumanApproval");

  const deliverables = Array.isArray(record?.mergedDeliverables) ? record.mergedDeliverables : [];
  if (deliverables.length !== 4) errors.push("mergedDeliverables-count");
  const repositories = new Set(deliverables.map((item) => item.repository));
  if (repositories.size !== REQUIRED_REPOSITORIES.size || [...REQUIRED_REPOSITORIES].some((repo) => !repositories.has(repo))) errors.push("mergedDeliverables-repositories");
  for (const item of deliverables) {
    if (item.state !== "MERGED") errors.push(`state:${item.repository}`);
    if (!SHA40.test(item.mergeCommit ?? "")) errors.push(`mergeCommit:${item.repository}`);
    if (!SHA40.test(item.verifiedHead ?? "")) errors.push(`verifiedHead:${item.repository}`);
    if (!Array.isArray(item.evidenceRuns) || item.evidenceRuns.length === 0 || item.evidenceRuns.some((id) => !Number.isInteger(id) || id <= 0)) errors.push(`evidenceRuns:${item.repository}`);
  }

  const followUps = Array.isArray(record?.completedFollowUps) ? record.completedFollowUps : [];
  const dashboard = followUps.find((item) => item.id === "P1-004");
  const releasePolicy = followUps.find((item) => item.id === "P1-003");
  const consumerInventory = followUps.find((item) => item.id === "P1-005");
  if (!dashboard || dashboard.state !== "VERIFIED" || dashboard.repository !== "vigilanty0x") errors.push("P1-004-followup");
  if (dashboard && (!SHA40.test(dashboard.mergeCommit ?? "") || !SHA40.test(dashboard.verifiedHead ?? "") || !Number.isInteger(dashboard.evidenceRun) || !SHA256.test(dashboard.upstreamSnapshotSha256 ?? ""))) errors.push("P1-004-evidence");
  if (!releasePolicy || releasePolicy.state !== "VERIFIED" || releasePolicy.scope !== "COMMON_POLICY_ONLY" || releasePolicy.realProductReleaseClaimed !== false || !SHA40.test(releasePolicy.verifiedHead ?? "") || !Number.isInteger(releasePolicy.evidenceRun)) errors.push("P1-003-followup");
  if (!consumerInventory || consumerInventory.state !== "VERIFIED" || consumerInventory.registeredRepositories !== 112 || consumerInventory.scannedRepositories !== 112 || consumerInventory.errors !== 0 || consumerInventory.limitationsPreserved !== true || !SHA40.test(consumerInventory.verifiedHead ?? "") || !Number.isInteger(consumerInventory.evidenceRun) || !Number.isInteger(consumerInventory.artifactId) || !/^sha256:[0-9a-f]{64}$/.test(consumerInventory.artifactDigest ?? "") || !SHA256.test(consumerInventory.evidenceSha256 ?? "")) errors.push("P1-005-followup");

  const invariants = record?.invariants ?? {};
  if (invariants.maxActiveConsolidations !== 2) errors.push("maxActiveConsolidations");
  if (invariants.maxOpenPullRequestsBeforeStop !== 50) errors.push("maxOpenPullRequestsBeforeStop");
  for (const field of ["automaticMerge", "automaticArchive", "automaticRedirect"]) if (invariants[field] !== false) errors.push(field);
  if (invariants.privateBoundaryExcluded !== true) errors.push("privateBoundaryExcluded");
  const gates = new Set(invariants.requiredArchiveGates ?? []);
  if (gates.size !== REQUIRED_ARCHIVE_GATES.size || [...REQUIRED_ARCHIVE_GATES].some((gate) => !gates.has(gate))) errors.push("requiredArchiveGates");

  const blocks = Array.isArray(record?.remainingProgramBlocks) ? record.remainingProgramBlocks : [];
  if (blocks.length < 4 || blocks.some((block) => !["BLOCKED", "BLOCKED_OUTSIDE_A01_SCOPE"].includes(block.status))) errors.push("remainingProgramBlocks");
  if (blocks.some((block) => block.id === "PROFILE_GENERATED_LIVE_DASHBOARD")) errors.push("stale-P1-004-block");
  if (blocks.some((block) => block.id === "CONSUMER_INVENTORY")) errors.push("stale-P1-005-block");
  if (!blocks.some((block) => block.id === "ACCOUNT_METADATA_AND_PINS")) errors.push("P1-007-block-missing");
  if (!Array.isArray(record?.irreversibleActionsPerformedByA01) || record.irreversibleActionsPerformedByA01.length !== 0) errors.push("irreversibleActionsPerformedByA01");
  return errors;
}

test("A01 final integration receipt and verified governance follow-ups are internally consistent", () => { assert.deepEqual(validate(baseline), []); });
test("counter-proof: A01 cannot claim a fifth merged repository outside its bounded integration set", () => {
  const c = clone(baseline); c.mergedDeliverables.push({target:"other",repository:"other-product",mergeCommit:"a".repeat(40),verifiedHead:"b".repeat(40),evidenceRuns:[1],state:"MERGED"});
  assert.ok(validate(c).includes("mergedDeliverables-count"));
});
test("counter-proof: a missing exact merge SHA invalidates the receipt", () => { const c=clone(baseline); c.mergedDeliverables[0].mergeCommit="main"; assert.ok(validate(c).some((e)=>e.startsWith("mergeCommit:"))); });
test("counter-proof: P1-004 cannot lose its exact upstream snapshot hash", () => { const c=clone(baseline); c.completedFollowUps[0].upstreamSnapshotSha256="bad"; assert.ok(validate(c).includes("P1-004-evidence")); });
test("counter-proof: final architecture count drift stays visible", () => { const c=clone(baseline); c.architecture.finalEntityCount=17; assert.ok(validate(c).includes("finalEntityCount")); });
test("counter-proof: archive can never become automatic", () => { const c=clone(baseline); c.invariants.automaticArchive=true; assert.ok(validate(c).includes("automaticArchive")); });
test("counter-proof: human approval cannot disappear from archive gates", () => { const c=clone(baseline); c.invariants.requiredArchiveGates=c.invariants.requiredArchiveGates.filter((g)=>g!=="humanApproval"); assert.ok(validate(c).includes("requiredArchiveGates")); });
test("counter-proof: completed P1-004 cannot remain listed as blocked", () => { const c=clone(baseline); c.remainingProgramBlocks.push({id:"PROFILE_GENERATED_LIVE_DASHBOARD",owner:"A01_GPT_5_6_SOL_1",status:"BLOCKED",reason:"stale"}); assert.ok(validate(c).includes("stale-P1-004-block")); });
test("counter-proof: residual blockers cannot be relabelled green inside the A01 receipt", () => { const c=clone(baseline); c.remainingProgramBlocks[0].status="VERIFIED"; assert.ok(validate(c).includes("remainingProgramBlocks")); });
test("counter-proof: P1-003 cannot claim a real product release", () => { const c=clone(baseline); const p=c.completedFollowUps.find((x)=>x.id==="P1-003"); p.realProductReleaseClaimed=true; assert.ok(validate(c).includes("P1-003-followup")); });
test("counter-proof: P1-005 cannot be complete with partial repository coverage", () => { const c=clone(baseline); const p=c.completedFollowUps.find((x)=>x.id==="P1-005"); p.scannedRepositories=111; assert.ok(validate(c).includes("P1-005-followup")); });
test("counter-proof: completed P1-005 cannot remain listed as blocked", () => { const c=clone(baseline); c.remainingProgramBlocks.push({id:"CONSUMER_INVENTORY",owner:"A01_GPT_5_6_SOL_1",status:"BLOCKED",reason:"stale"}); assert.ok(validate(c).includes("stale-P1-005-block")); });
test("counter-proof: an irreversible A01 action must not be hidden in a completed receipt", () => { const c=clone(baseline); c.irreversibleActionsPerformedByA01.push("ARCHIVE_SOURCE"); assert.ok(validate(c).includes("irreversibleActionsPerformedByA01")); });

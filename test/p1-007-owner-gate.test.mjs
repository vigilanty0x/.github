import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const gate = JSON.parse(fs.readFileSync("portfolio/p1-007-owner-gate.json", "utf8"));
const expectedPins = [
  "apprentice-ai",
  "repo-doctor",
  "proofgate",
  "ai-assistance-manifest",
  "model-router",
  "local-ai-stack",
];

function clone(value) {
  return structuredClone(value);
}

function validate(record) {
  const errors = [];
  if (record.schemaVersion !== 1) errors.push("schemaVersion");
  if (record.id !== "P1-007") errors.push("id");
  if (record.owner !== "A01_GPT_5_6_SOL_1") errors.push("owner");
  if (record.target !== "portfolio-profile") errors.push("target");
  if (record.status !== "BLOCKED_ON_ACCOUNT_OWNER_ACTION") errors.push("status");
  if (!/^[0-9a-f]{40}$/.test(record.implementation?.mergeCommit ?? "")) errors.push("mergeCommit");
  if (!/^[0-9a-f]{40}$/.test(record.implementation?.verifiedHead ?? "")) errors.push("verifiedHead");
  if (!Number.isInteger(record.implementation?.evidenceRun) || record.implementation.evidenceRun <= 0) errors.push("evidenceRun");
  if (record.implementation?.issue !== 4) errors.push("issue");
  if (record.implementation?.command !== "/apply-profile-settings") errors.push("command");
  if (record.implementation?.secretName !== "PROFILE_ADMIN_TOKEN") errors.push("secretName");
  if (record.currentObservedRepositoryState?.homepage !== null) errors.push("observedHomepage");
  if (record.currentObservedRepositoryState?.hasPages !== false) errors.push("observedPages");
  if (!Array.isArray(record.currentObservedRepositoryState?.topics) || record.currentObservedRepositoryState.topics.length !== 0) errors.push("observedTopics");
  if (JSON.stringify(record.expectedPins) !== JSON.stringify(expectedPins)) errors.push("expectedPins");
  const token = record.tokenPolicy ?? {};
  if (token.pasteIntoChat !== false || token.pasteIntoIssue !== false || token.pasteIntoCommit !== false) errors.push("tokenDisclosure");
  if (token.shortExpiry !== true || token.accountProfileWrite !== true || token.repositoryAdministrationWrite !== true || token.repositoryPagesWrite !== true || token.selectedRepositoriesOnly !== true) errors.push("tokenScope");
  const completion = record.completionGate ?? {};
  for (const key of ["workflowMustPass", "pagesMustBeEnabled", "profileMetadataMustMatch", "topicSubsetsMustMatch", "exactPinsMustMatch"]) {
    if (completion[key] !== true) errors.push(key);
  }
  if (completion.automaticCompletion !== false) errors.push("automaticCompletion");
  return errors;
}

test("P1-007 owner gate truth is internally consistent", () => {
  assert.deepEqual(validate(gate), []);
});

test("counter-proof: P1-007 cannot be marked verified before owner-only actions run", () => {
  const candidate = clone(gate);
  candidate.status = "VERIFIED";
  assert.ok(validate(candidate).includes("status"));
});

test("counter-proof: token disclosure can never be authorized by the gate", () => {
  const candidate = clone(gate);
  candidate.tokenPolicy.pasteIntoChat = true;
  assert.ok(validate(candidate).includes("tokenDisclosure"));
});

test("counter-proof: the six canonical pins cannot be replaced by a transitional identity", () => {
  const candidate = clone(gate);
  candidate.expectedPins[0] = "agent-dashboard";
  assert.ok(validate(candidate).includes("expectedPins"));
});

test("counter-proof: an unverified implementation SHA cannot satisfy the gate", () => {
  const candidate = clone(gate);
  candidate.implementation.verifiedHead = "main";
  assert.ok(validate(candidate).includes("verifiedHead"));
});

test("counter-proof: completion cannot become automatic", () => {
  const candidate = clone(gate);
  candidate.completionGate.automaticCompletion = true;
  assert.ok(validate(candidate).includes("automaticCompletion"));
});

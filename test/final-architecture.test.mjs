import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { validateFinalArchitecture } from "../scripts/check-final-architecture.mjs";

const baseline = JSON.parse(fs.readFileSync("portfolio/final-architecture.json", "utf8"));

function clone(value) {
  return structuredClone(value);
}

function expectRejected(mutator, pattern) {
  const candidate = clone(baseline);
  mutator(candidate);
  const errors = validateFinalArchitecture(candidate);
  assert.ok(errors.some((error) => pattern.test(error)), `expected ${pattern}, got: ${errors.join(" | ")}`);
}

test("prepared final architecture is internally consistent", () => {
  assert.deepEqual(validateFinalArchitecture(baseline), []);
});

test("counter-proof: a seventeenth entity is rejected", () => {
  expectRejected((candidate) => {
    candidate.finalState.entities.push({ id: "extra-product", repositories: ["extra-product"] });
  }, /exactly 16 entities|exactly 17 unique active repositories/);
});

test("counter-proof: duplicate active repository is rejected", () => {
  expectRejected((candidate) => {
    candidate.finalState.entities[0].repositories = ["ai-assistance-manifest"];
  }, /17 unique active repositories|mapping and activeRepositories disagree/);
});

test("counter-proof: Apprentice AI cannot silently become an AgentOps module", () => {
  expectRejected((candidate) => {
    const apprentice = candidate.finalState.entities.find((entity) => entity.id === "apprentice-ai");
    apprentice.standalone = false;
  }, /apprentice-ai must remain a standalone/);
});

test("counter-proof: an AgentOps satellite cannot remain a final standalone entity", () => {
  expectRejected((candidate) => {
    candidate.transitionalAbsorptions = candidate.transitionalAbsorptions.filter(
      (item) => item.sourceProductIdentity !== "agent-handoff",
    );
  }, /missing transitional absorption: agent-handoff/);
});

test("counter-proof: Shipcheck release gate cannot point at another final product", () => {
  expectRejected((candidate) => {
    const item = candidate.transitionalAbsorptions.find(
      (entry) => entry.sourceProductIdentity === "shipcheck-release-gate",
    );
    item.targetEntity = "repo-doctor";
  }, /shipcheck-release-gate targets the wrong final entity/);
});

test("counter-proof: archive cannot become automatic", () => {
  expectRejected((candidate) => {
    candidate.archivePolicy.automatic = true;
  }, /archive must never be automatic/);
});

test("counter-proof: removing rollback from archive gates is rejected", () => {
  expectRejected((candidate) => {
    candidate.archivePolicy.requiredGates = candidate.archivePolicy.requiredGates.filter(
      (gate) => gate !== "rollback",
    );
  }, /archive gate missing: rollback/);
});

test("counter-proof: final activation cannot lose explicit human approval", () => {
  expectRejected((candidate) => {
    candidate.activationRequiresHumanApproval = false;
  }, /activationRequiresHumanApproval must be true/);
});

test("counter-proof: public registry rejects the private-product marker", () => {
  expectRejected((candidate) => {
    candidate.privateExample = ["S", "K", "Y", "O", "M"].join("");
  }, /private-product identifier/);
});

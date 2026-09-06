import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildExpectedSourceMapping,
  validateFinalArchitecture,
} from "../scripts/check-final-architecture.mjs";

const baseline = JSON.parse(fs.readFileSync("portfolio/final-architecture.json", "utf8"));
const registry = JSON.parse(fs.readFileSync("portfolio/targets.json", "utf8"));

function clone(value) {
  return structuredClone(value);
}

function expectRejected(mutator, pattern) {
  const candidate = clone(baseline);
  mutator(candidate);
  const errors = validateFinalArchitecture(candidate, registry);
  assert.ok(errors.some((error) => pattern.test(error)), `expected ${pattern}, got: ${errors.join(" | ")}`);
}

function entity(candidate, id) {
  return candidate.finalState.entities.find((entry) => entry.id === id);
}

test("prepared concrete-six architecture covers the complete public registry", () => {
  assert.equal(buildExpectedSourceMapping(registry).size, 112);
  assert.deepEqual(validateFinalArchitecture(baseline, registry), []);
});

test("counter-proof: a ninth public entity is rejected", () => {
  expectRejected((candidate) => {
    candidate.finalState.entities.push({
      id: "extra-product",
      kind: "PRODUCT",
      repositories: ["extra-product"],
      sourceRepositoryCount: 1,
      sourceRepositories: ["extra-product"],
    });
  }, /exactly 8 public entities|entity set|unexpected public source/);
});

test("counter-proof: missing one of 112 public sources is rejected", () => {
  expectRejected((candidate) => {
    const target = entity(candidate, "automation-control-plane");
    target.sourceRepositories.pop();
    target.sourceRepositoryCount -= 1;
  }, /112 unique public sources|source destination mismatch/);
});

test("counter-proof: a public source cannot appear in two products", () => {
  expectRejected((candidate) => {
    const target = entity(candidate, "promptops");
    target.sourceRepositories.push("proofgate");
    target.sourceRepositoryCount += 1;
  }, /public source appears more than once/);
});

test("counter-proof: TrustKit and Contract Lab remain under ProofGate", () => {
  expectRejected((candidate) => {
    const proof = entity(candidate, "proofgate");
    const doctor = entity(candidate, "repo-doctor");
    proof.sourceRepositories = proof.sourceRepositories.filter((name) => name !== "trustkit");
    proof.sourceRepositoryCount -= 1;
    doctor.sourceRepositories.push("trustkit");
    doctor.sourceRepositoryCount += 1;
  }, /source destination mismatch: trustkit expected proofgate/);
});

test("counter-proof: Portfolio Kit remains in profile support", () => {
  expectRejected((candidate) => {
    const profile = entity(candidate, "portfolio-profile");
    const doctor = entity(candidate, "repo-doctor");
    profile.sourceRepositories = profile.sourceRepositories.filter((name) => name !== "portfolio-kit");
    profile.sourceRepositoryCount -= 1;
    doctor.sourceRepositories.push("portfolio-kit");
    doctor.sourceRepositoryCount += 1;
  }, /source destination mismatch: portfolio-kit expected portfolio-profile/);
});

test("counter-proof: workflow templates remain in GitHub support", () => {
  expectRejected((candidate) => {
    const support = entity(candidate, "community-governance");
    const shipcheck = entity(candidate, "shipcheck");
    support.sourceRepositories = support.sourceRepositories.filter((name) => name !== "workflow-templates");
    support.sourceRepositoryCount -= 1;
    shipcheck.sourceRepositories.push("workflow-templates");
    shipcheck.sourceRepositoryCount += 1;
  }, /source destination mismatch: workflow-templates expected community-governance/);
});

test("counter-proof: connected target remains eight public plus one private aggregate", () => {
  expectRejected((candidate) => {
    candidate.finalState.connectedRepositoryCount = 8;
  }, /connected repository target count must be 9|must equal public plus private/);
});

test("counter-proof: private repository details cannot enter the public registry", () => {
  expectRejected((candidate) => {
    candidate.finalState.privateRepositories = ["redacted-specific-identifier"];
  }, /only the aggregate privateRepositoryCount/);
});

test("counter-proof: GitHub migration cannot be claimed from local preparation", () => {
  expectRejected((candidate) => {
    candidate.githubMigrationState = "APPLIED";
  }, /githubMigrationState must remain NOT_APPLIED/);
});

test("counter-proof: deletion cannot become authorized", () => {
  expectRejected((candidate) => {
    candidate.deletionAuthorized = true;
    candidate.retirementPolicy.deletionAuthorized = true;
  }, /deletion must remain unauthorized|deletionAuthorized must remain false/);
});

test("counter-proof: final activation cannot lose explicit human approval", () => {
  expectRejected((candidate) => {
    candidate.activationRequiresHumanApproval = false;
  }, /activationRequiresHumanApproval must be true/);
});

test("counter-proof: rollback remains a mandatory retirement gate", () => {
  expectRejected((candidate) => {
    candidate.retirementPolicy.requiredGates = candidate.retirementPolicy.requiredGates.filter(
      (gate) => gate !== "rollback",
    );
  }, /retirement gate missing: rollback/);
});

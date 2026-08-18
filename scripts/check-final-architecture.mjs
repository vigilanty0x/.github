import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_ARCHIVE_GATES = [
  "release",
  "compatibility",
  "consumers",
  "redirect",
  "rollback",
  "humanApproval",
];

const EXPECTED_ACTIVE_REPOSITORIES = [
  ".github",
  "ai-assistance-manifest",
  "ai-software-factory",
  "apprentice-ai",
  "automation-control-plane",
  "contract-lab",
  "devdocs",
  "local-ai-stack",
  "model-router",
  "portfolio-kit",
  "promptops",
  "proofgate",
  "rag-lab",
  "repo-doctor",
  "shipcheck",
  "trustkit",
  "vigilanty0x",
];

const EXPECTED_ABSORPTIONS = new Map([
  ["agent-dashboard", "agentops"],
  ["agent-handoff", "agentops"],
  ["agent-worktrees", "agentops"],
  ["safe-merge-gate", "shipcheck"],
  ["shipcheck-release-gate", "shipcheck"],
]);

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateFinalArchitecture(document) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return ["document must be an object"];
  }

  if (document.scope !== "PUBLIC_ONLY") errors.push("scope must be PUBLIC_ONLY");
  if (document.status !== "PREPARED") errors.push("status must remain PREPARED before human activation");
  if (document.activationRequiresHumanApproval !== true) {
    errors.push("activationRequiresHumanApproval must be true");
  }
  if (document.currentSafePlan?.targetCount !== 18) {
    errors.push("currentSafePlan.targetCount must be 18 during the transitional review state");
  }

  const finalState = document.finalState ?? {};
  const entities = Array.isArray(finalState.entities) ? finalState.entities : [];
  if (finalState.entityCount !== 16 || entities.length !== 16) {
    errors.push("final state must contain exactly 16 entities");
  }

  const entityIds = entities.map((entity) => entity?.id);
  if (new Set(entityIds).size !== entityIds.length || entityIds.some((value) => typeof value !== "string" || !value)) {
    errors.push("entity ids must be non-empty and unique");
  }

  const flattenedRepositories = [];
  for (const entity of entities) {
    if (!Array.isArray(entity?.repositories) || entity.repositories.length === 0) {
      errors.push(`entity ${entity?.id ?? "<unknown>"} must declare repositories`);
      continue;
    }
    for (const repository of entity.repositories) {
      if (typeof repository !== "string" || !repository) {
        errors.push(`entity ${entity?.id ?? "<unknown>"} has an invalid repository`);
      } else {
        flattenedRepositories.push(repository);
      }
    }
  }

  if (flattenedRepositories.length !== 17 || new Set(flattenedRepositories).size !== 17) {
    errors.push("final entities must map to exactly 17 unique active repositories");
  }

  const declaredActive = Array.isArray(finalState.activeRepositories) ? finalState.activeRepositories : [];
  if (finalState.activeRepositoryCount !== 17 || declaredActive.length !== 17) {
    errors.push("finalState.activeRepositoryCount and activeRepositories must both equal 17");
  }
  if (!sameArray(sorted(declaredActive), sorted(EXPECTED_ACTIVE_REPOSITORIES))) {
    errors.push("active repository set does not match the prepared final arbitration");
  }
  if (!sameArray(sorted(flattenedRepositories), sorted(declaredActive))) {
    errors.push("entity repository mapping and activeRepositories disagree");
  }

  const profile = entities.find((entity) => entity?.id === "portfolio-profile");
  if (!profile || !sameArray(sorted(profile.repositories ?? []), ["portfolio-kit", "vigilanty0x"])) {
    errors.push("portfolio-profile must map exactly to portfolio-kit and vigilanty0x");
  }

  const apprentice = entities.find((entity) => entity?.id === "apprentice-ai");
  if (!apprentice || apprentice.standalone !== true || !sameArray(apprentice.repositories ?? [], ["apprentice-ai"])) {
    errors.push("apprentice-ai must remain a standalone final entity");
  }

  const absorptions = Array.isArray(document.transitionalAbsorptions) ? document.transitionalAbsorptions : [];
  const seenAbsorptions = new Set();
  for (const absorption of absorptions) {
    const source = absorption?.sourceProductIdentity;
    if (typeof source !== "string" || !EXPECTED_ABSORPTIONS.has(source)) {
      errors.push(`unexpected transitional absorption: ${String(source)}`);
      continue;
    }
    if (seenAbsorptions.has(source)) errors.push(`duplicate transitional absorption: ${source}`);
    seenAbsorptions.add(source);
    if (absorption.targetEntity !== EXPECTED_ABSORPTIONS.get(source)) {
      errors.push(`${source} targets the wrong final entity`);
    }
    if (absorption.state !== "PENDING_GATES") {
      errors.push(`${source} must remain PENDING_GATES before activation`);
    }
  }
  for (const source of EXPECTED_ABSORPTIONS.keys()) {
    if (!seenAbsorptions.has(source)) errors.push(`missing transitional absorption: ${source}`);
  }

  const archivePolicy = document.archivePolicy ?? {};
  if (archivePolicy.eventualCandidateCount !== 95) errors.push("eventual archive candidate count must be 95");
  if (archivePolicy.automatic !== false) errors.push("archive must never be automatic");
  const archiveGates = Array.isArray(archivePolicy.requiredGates) ? archivePolicy.requiredGates : [];
  for (const gate of REQUIRED_ARCHIVE_GATES) {
    if (!archiveGates.includes(gate)) errors.push(`archive gate missing: ${gate}`);
  }

  const serialized = JSON.stringify(document).toLowerCase();
  const forbiddenPrivateMarker = ["s", "k", "y", "o", "m"].join("");
  if (serialized.includes(forbiddenPrivateMarker)) {
    errors.push("private-product identifier must not appear in the public final-architecture registry");
  }

  return errors;
}

export function checkFinalArchitecture(filePath) {
  const absolute = path.resolve(filePath);
  let document;
  try {
    document = JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    return [`cannot parse ${absolute}: ${error.message}`];
  }
  return validateFinalArchitecture(document);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const filePath = process.argv[2] ?? "portfolio/final-architecture.json";
  const errors = checkFinalArchitecture(filePath);
  if (errors.length > 0) {
    for (const error of errors) console.error(`FINAL_ARCHITECTURE: ${error}`);
    process.exitCode = 1;
  } else {
    console.log("FINAL_ARCHITECTURE: PASS — 16 entities / 17 active repositories; activation remains human-gated");
  }
}

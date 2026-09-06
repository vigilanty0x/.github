import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_RETIREMENT_GATES = [
  "exactImport",
  "compatibility",
  "tests",
  "consumers",
  "redirect",
  "rollback",
  "humanApproval",
];

const EXPECTED_ENTITIES = new Map([
  ["automation-control-plane", { kind: "PRODUCT", repository: "automation-control-plane" }],
  ["promptops", { kind: "PRODUCT", repository: "promptops" }],
  ["rag-lab", { kind: "PRODUCT", repository: "rag-lab" }],
  ["shipcheck", { kind: "PRODUCT", repository: "shipcheck" }],
  ["repo-doctor", { kind: "PRODUCT", repository: "repo-doctor" }],
  ["proofgate", { kind: "PRODUCT", repository: "proofgate" }],
  ["community-governance", { kind: "SUPPORT", repository: ".github" }],
  ["portfolio-profile", { kind: "SUPPORT", repository: "vigilanty0x" }],
]);

const TARGET_DESTINATIONS = new Map([
  ["ai-software-factory", "automation-control-plane"],
  ["agent-dashboard", "automation-control-plane"],
  ["agent-handoff", "automation-control-plane"],
  ["agent-worktrees", "automation-control-plane"],
  ["ai-assistance-manifest", "repo-doctor"],
  ["model-router", "automation-control-plane"],
  ["proofgate", "proofgate"],
  ["shipcheck", "shipcheck"],
  ["repo-doctor", "repo-doctor"],
  ["promptops", "promptops"],
  ["rag-lab", "rag-lab"],
  ["local-ai-stack", "promptops"],
  ["trustkit", "proofgate"],
  ["contract-lab", "proofgate"],
  ["devdocs", "repo-doctor"],
  ["portfolio-profile", "portfolio-profile"],
  ["community-governance", "community-governance"],
  ["agentops", "automation-control-plane"],
]);

const STANDALONE_DESTINATIONS = new Map([
  ["apprentice-ai", "automation-control-plane"],
  ["shipcheck-release-gate", "shipcheck"],
]);

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assign(assignments, repository, destination) {
  if (typeof repository !== "string" || !repository) return;
  const previous = assignments.get(repository);
  if (previous && previous !== destination) {
    throw new Error(`registry maps ${repository} to both ${previous} and ${destination}`);
  }
  assignments.set(repository, destination);
}

export function buildExpectedSourceMapping(registry) {
  if (!registry || typeof registry !== "object" || !Array.isArray(registry.targets)) {
    throw new Error("public target registry must contain targets");
  }
  const assignments = new Map();
  for (const target of registry.targets) {
    const destination = TARGET_DESTINATIONS.get(target?.id);
    if (!destination) throw new Error(`unmapped transitional target: ${String(target?.id)}`);
    assign(assignments, target.canonicalRepository, destination);
    for (const repository of target.companionRepositories ?? []) assign(assignments, repository, destination);
    for (const source of target.sources ?? []) assign(assignments, source?.repository, destination);
  }
  for (const standalone of registry.standaloneRepositories ?? []) {
    const destination = STANDALONE_DESTINATIONS.get(standalone?.repository);
    if (!destination) throw new Error("public standalone repository has no concrete-six destination");
    assign(assignments, standalone.repository, destination);
  }
  if (registry.expectedPublicRepositoryCount !== 112 || assignments.size !== 112) {
    throw new Error(`public source universe must contain 112 repositories, found ${assignments.size}`);
  }
  return assignments;
}

function privateDetailKeys(value, location = "document") {
  const findings = [];
  if (!value || typeof value !== "object") return findings;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if (key.toLowerCase().includes("private") && key !== "privateRepositoryCount") {
      findings.push(childLocation);
    }
    findings.push(...privateDetailKeys(child, childLocation));
  }
  return findings;
}

export function validateFinalArchitecture(document, registry) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return ["document must be an object"];
  }

  if (document.schemaVersion !== 2) errors.push("schemaVersion must be 2");
  if (document.scope !== "PUBLIC_ONLY") errors.push("scope must be PUBLIC_ONLY");
  if (document.status !== "PREPARED") errors.push("status must remain PREPARED before human activation");
  if (document.implementationState !== "LOCAL_ONLY") errors.push("implementationState must remain LOCAL_ONLY");
  if (document.githubMigrationState !== "NOT_APPLIED") errors.push("githubMigrationState must remain NOT_APPLIED");
  if (document.activationRequiresHumanApproval !== true) {
    errors.push("activationRequiresHumanApproval must be true");
  }
  if (document.deletionAuthorized !== false) errors.push("deletion must remain unauthorized");
  if (document.currentSafePlan?.targetCount !== 18) {
    errors.push("currentSafePlan.targetCount must remain 18 during the transitional review state");
  }
  if (document.currentSafePlan?.publicRepositoryCount !== 112) {
    errors.push("currentSafePlan.publicRepositoryCount must remain 112 until GitHub changes are verified");
  }

  const finalState = document.finalState ?? {};
  const entities = Array.isArray(finalState.entities) ? finalState.entities : [];
  if (finalState.entityCount !== 8 || entities.length !== 8) {
    errors.push("prepared state must contain exactly 8 public entities");
  }
  if (finalState.productCount !== 6) errors.push("prepared state must contain exactly 6 products");
  if (finalState.supportCount !== 2) errors.push("prepared state must contain exactly 2 support repositories");
  if (finalState.activeRepositoryCount !== 8) errors.push("prepared public repository count must be 8");
  if (finalState.privateRepositoryCount !== 1) errors.push("private repository aggregate count must be 1");
  if (finalState.connectedRepositoryCount !== 9) errors.push("connected repository target count must be 9");
  if (finalState.activeRepositoryCount + finalState.privateRepositoryCount !== finalState.connectedRepositoryCount) {
    errors.push("connected repository count must equal public plus private aggregate counts");
  }
  if (finalState.sourcePublicRepositoryCount !== 112) {
    errors.push("prepared mapping must cover exactly 112 public source repositories");
  }

  const expectedActive = sorted([...EXPECTED_ENTITIES.values()].map((entry) => entry.repository));
  const declaredActive = Array.isArray(finalState.activeRepositories) ? finalState.activeRepositories : [];
  if (declaredActive.length !== 8 || new Set(declaredActive).size !== 8) {
    errors.push("activeRepositories must contain exactly 8 unique public repositories");
  } else if (!sameArray(sorted(declaredActive), expectedActive)) {
    errors.push("active repository set does not match the concrete-six topology");
  }

  const entityIds = entities.map((entity) => entity?.id);
  if (new Set(entityIds).size !== entityIds.length || entityIds.some((value) => typeof value !== "string" || !value)) {
    errors.push("entity ids must be non-empty and unique");
  }
  if (!sameArray(sorted(entityIds), sorted(EXPECTED_ENTITIES.keys()))) {
    errors.push("entity set does not match the six products and two supports");
  }

  const actualAssignments = new Map();
  for (const entity of entities) {
    const expected = EXPECTED_ENTITIES.get(entity?.id);
    if (!expected) continue;
    if (entity.kind !== expected.kind) errors.push(`${entity.id} has the wrong entity kind`);
    if (!sameArray(entity.repositories ?? [], [expected.repository])) {
      errors.push(`${entity.id} must map to repository ${expected.repository}`);
    }
    const sources = Array.isArray(entity.sourceRepositories) ? entity.sourceRepositories : [];
    if (entity.sourceRepositoryCount !== sources.length || sources.length === 0) {
      errors.push(`${entity.id} sourceRepositoryCount does not match its source list`);
    }
    if (new Set(sources).size !== sources.length) errors.push(`${entity.id} contains duplicate sources`);
    for (const source of sources) {
      if (typeof source !== "string" || !/^(?:\.github|[a-z0-9][a-z0-9-]*)$/.test(source)) {
        errors.push(`${entity.id} has an invalid public source repository`);
        continue;
      }
      if (actualAssignments.has(source)) {
        errors.push(`public source appears more than once: ${source}`);
      } else {
        actualAssignments.set(source, entity.id);
      }
    }
  }

  if (actualAssignments.size !== 112) {
    errors.push(`prepared mapping must contain 112 unique public sources, found ${actualAssignments.size}`);
  }
  try {
    const expectedAssignments = buildExpectedSourceMapping(registry);
    for (const [source, destination] of expectedAssignments) {
      const actual = actualAssignments.get(source);
      if (actual !== destination) {
        errors.push(`source destination mismatch: ${source} expected ${destination}, found ${actual ?? "missing"}`);
      }
    }
    for (const source of actualAssignments.keys()) {
      if (!expectedAssignments.has(source)) errors.push(`unexpected public source: ${source}`);
    }
  } catch (error) {
    errors.push(`cannot derive public source universe: ${error.message}`);
  }

  const retirement = document.retirementPolicy ?? {};
  if (retirement.nonTargetPublicRepositoryCount !== 104) {
    errors.push("non-target public repository count must be 104");
  }
  for (const field of ["automatic", "archiveAuthorized", "deletionAuthorized", "transferAuthorized"]) {
    if (retirement[field] !== false) errors.push(`${field} must remain false`);
  }
  const gates = Array.isArray(retirement.requiredGates) ? retirement.requiredGates : [];
  for (const gate of REQUIRED_RETIREMENT_GATES) {
    if (!gates.includes(gate)) errors.push(`retirement gate missing: ${gate}`);
  }

  const privateKeys = privateDetailKeys(document);
  if (privateKeys.length > 1 || privateKeys.some((key) => !key.endsWith("finalState.privateRepositoryCount"))) {
    errors.push("public architecture may expose only the aggregate privateRepositoryCount");
  }

  return errors;
}

export function checkFinalArchitecture(filePath, registryPath = "portfolio/targets.json") {
  const absolute = path.resolve(filePath);
  const registryAbsolute = path.resolve(registryPath);
  let document;
  let registry;
  try {
    document = JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    return [`cannot parse ${absolute}: ${error.message}`];
  }
  try {
    registry = JSON.parse(fs.readFileSync(registryAbsolute, "utf8"));
  } catch (error) {
    return [`cannot parse ${registryAbsolute}: ${error.message}`];
  }
  return validateFinalArchitecture(document, registry);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const filePath = process.argv[2] ?? "portfolio/final-architecture.json";
  const registryPath = process.argv[3] ?? "portfolio/targets.json";
  const errors = checkFinalArchitecture(filePath, registryPath);
  if (errors.length > 0) {
    for (const error of errors) console.error(`FINAL_ARCHITECTURE: ${error}`);
    process.exitCode = 1;
  } else {
    console.log("FINAL_ARCHITECTURE: PASS — 112 public sources -> 6 products + 2 supports; connected target 9; GitHub migration not applied; deletion unauthorized");
  }
}

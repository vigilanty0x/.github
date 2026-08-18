#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_FILES = {
  targets: "portfolio/targets.json",
  actions: "portfolio/actions.json",
  freeze: "portfolio/freeze.json",
  triage: "portfolio/triage-policy.json",
  agentops: "portfolio/agentops-decision.json",
  targetsSchema: "portfolio/targets.schema.json",
  actionsSchema: "portfolio/actions.schema.json",
};

const EXACT_VOCABULARY = Object.freeze({
  target: ["PROPOSED", "REHEARSAL", "READY", "RELEASED", "VERIFIED", "ROLLED_BACK"],
  source: [
    "ACTIVE_SOURCE",
    "ACTIVE_TARGET",
    "FROZEN_SOURCE",
    "MIGRATION_IN_PROGRESS",
    "TARGET_RELEASED",
    "REDIRECTED",
    "ARCHIVE_CANDIDATE",
    "ARCHIVE_APPROVED",
    "ARCHIVED",
    "ROLLED_BACK",
  ],
  evidence: ["OBSERVED", "CALCULATED", "INFERRED", "NOT_PROVEN", "BLOCKED", "VERIFIED"],
  gate: ["PASS", "BLOCKED", "NOT_RUN", "WAIVED"],
});

const REQUIRED_GATES = Object.freeze([
  "decision",
  "import",
  "compatibility",
  "release",
  "consumers",
  "redirect",
  "rollback",
  "humanApproval",
]);

const TECHNICAL_ARCHIVE_GATES = Object.freeze([
  "decision",
  "import",
  "compatibility",
  "release",
  "consumers",
  "redirect",
  "rollback",
]);

const REQUIRED_TRIAGE_CATEGORIES = Object.freeze([
  "SECURITY",
  "CONSOLIDATION",
  "RELEASE",
  "DEPENDABOT",
  "SUPERSEDED_CANDIDATE",
  "REVIEW",
]);

const REQUIRED_FREEZE_BLOCKS = Object.freeze([
  "CREATE_PUBLIC_REPOSITORY",
  "OPEN_NON_URGENT_PULL_REQUEST",
  "ARCHIVE_SOURCE",
  "PUBLISH_UNVERIFIED_RELEASE",
]);

const REQUIRED_HUMAN_APPROVAL_ACTIONS = Object.freeze([
  "DISABLE_FREEZE",
  "ARCHIVE_SOURCE",
  "PUBLISH_STABLE_RELEASE",
  "WAIVE_GATE",
]);

const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST64 = /^[0-9a-f]{64}$/;
const REPOSITORY_NAME = /^(?:\.github|[a-z0-9]+(?:[._-][a-z0-9]+)*)$/;
const ACTION_ID = /^P([0-3])-[0-9]{3}$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finding(rule, path, message, extra = {}) {
  return { rule, path, message, ...extra };
}

function push(findings, rule, path, message, extra = {}) {
  findings.push(finding(rule, path, message, extra));
}

function parseDate(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function sameSet(left, right) {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function duplicates(values) {
  const seen = new Set();
  const result = new Set();
  for (const value of values) {
    if (seen.has(value)) result.add(value);
    else seen.add(value);
  }
  return [...result].sort();
}

function requireRecord(findings, value, path) {
  if (!isRecord(value)) {
    push(findings, "type", path, "Expected an object.");
    return false;
  }
  return true;
}

function requireArray(findings, value, path) {
  if (!Array.isArray(value)) {
    push(findings, "type", path, "Expected an array.");
    return false;
  }
  return true;
}

function requireString(findings, value, path, { minLength = 1, pattern = null, nullable = false } = {}) {
  if (nullable && value === null) return true;
  if (typeof value !== "string") {
    push(findings, "type", path, nullable ? "Expected a string or null." : "Expected a string.");
    return false;
  }
  if (value.length < minLength) {
    push(findings, "string-length", path, `Expected at least ${minLength} characters.`);
    return false;
  }
  if (pattern && !pattern.test(value)) {
    push(findings, "string-pattern", path, "Value does not match the required format.");
    return false;
  }
  return true;
}

function requireEnum(findings, value, allowed, path) {
  if (!allowed.includes(value)) {
    push(findings, "enum", path, `Expected one of: ${allowed.join(", ")}.`);
    return false;
  }
  return true;
}

function requireInteger(findings, value, path, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    push(findings, "integer", path, `Expected an integer >= ${minimum}.`);
    return false;
  }
  return true;
}

function requireDate(findings, value, path, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const date = parseDate(value);
  if (!date) push(findings, "date-time", path, nullable ? "Expected an ISO date-time or null." : "Expected an ISO date-time.");
  return date;
}

function requireExactKeys(findings, value, expected, path) {
  if (!isRecord(value)) return;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  for (const key of actual.filter((entry) => !wanted.includes(entry))) {
    push(findings, "additional-property", `${path}.${key}`, "Unexpected property.");
  }
  for (const key of wanted.filter((entry) => !actual.includes(entry))) {
    push(findings, "required-property", `${path}.${key}`, "Missing required property.");
  }
}

async function readJson(root, relativePath, findings) {
  const absolute = join(root, relativePath);
  try {
    const raw = await readFile(absolute, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    push(findings, "json-load", relativePath, `Unable to load valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function validateRepositoryName(findings, value, path) {
  return requireString(findings, value, path, { pattern: REPOSITORY_NAME });
}

function validateSha(findings, value, path, { nullable = true } = {}) {
  if (nullable && value === null) return true;
  return requireString(findings, value, path, { pattern: SHA40 });
}

function validateDigest(findings, value, path, { nullable = true } = {}) {
  if (nullable && value === null) return true;
  return requireString(findings, value, path, { pattern: DIGEST64 });
}

function validateEvidence(findings, evidence, path, now) {
  if (!requireRecord(findings, evidence, path)) return;
  requireExactKeys(findings, evidence, ["status", "source", "observedAt", "expiresAt"], path);
  requireEnum(findings, evidence.status, EXACT_VOCABULARY.evidence, `${path}.status`);
  requireString(findings, evidence.source, `${path}.source`);
  const observedAt = requireDate(findings, evidence.observedAt, `${path}.observedAt`);
  const expiresAt = requireDate(findings, evidence.expiresAt, `${path}.expiresAt`);
  if (observedAt && expiresAt && observedAt >= expiresAt) {
    push(findings, "evidence-window", path, "Evidence expiry must be later than observation time.");
  }
  if (expiresAt && expiresAt <= now) {
    push(findings, "stale-evidence", path, "Evidence has expired and must not support a current status.");
  }
}

function validateRelease(findings, target, path) {
  const release = target.release;
  if (!requireRecord(findings, release, path)) return;
  requireExactKeys(findings, release, ["status", "version", "tag", "url", "artifactSha256", "publishedAt"], path);
  const allowed = ["NOT_RELEASED", "PREPARED", "TAGGED", "RELEASED", "VERIFIED"];
  requireEnum(findings, release.status, allowed, `${path}.status`);
  requireString(findings, release.version, `${path}.version`, { nullable: true });
  requireString(findings, release.tag, `${path}.tag`, { nullable: true });
  requireString(findings, release.url, `${path}.url`, { nullable: true });
  validateDigest(findings, release.artifactSha256, `${path}.artifactSha256`);
  requireDate(findings, release.publishedAt, `${path}.publishedAt`, { nullable: true });

  const metadataFields = [release.version, release.tag, release.url, release.artifactSha256, release.publishedAt];
  if (release.status === "NOT_RELEASED" && metadataFields.some((value) => value !== null)) {
    push(findings, "release-contradiction", path, "NOT_RELEASED must not carry tag, publication, URL, or artifact proof.");
  }
  if (release.status === "PREPARED") {
    if (!release.version) push(findings, "release-metadata", `${path}.version`, "PREPARED requires a candidate version.");
    if ([release.tag, release.url, release.artifactSha256, release.publishedAt].some((value) => value !== null)) {
      push(findings, "release-contradiction", path, "PREPARED must not claim a tag, published release, artifact digest, or publication date.");
    }
  }
  if (release.status === "TAGGED") {
    if (!release.version || !release.tag) push(findings, "release-metadata", path, "TAGGED requires version and tag.");
    if (release.url || release.artifactSha256 || release.publishedAt) {
      push(findings, "release-contradiction", path, "TAGGED must not claim a published release before release evidence exists.");
    }
  }
  if (["RELEASED", "VERIFIED"].includes(release.status)) {
    const required = {
      version: release.version,
      tag: release.tag,
      url: release.url,
      artifactSha256: release.artifactSha256,
      publishedAt: release.publishedAt,
    };
    for (const [name, value] of Object.entries(required)) {
      if (!value) push(findings, "release-metadata", `${path}.${name}`, `${release.status} requires ${name}.`);
    }
    if (target.gates?.release !== "PASS") {
      push(findings, "release-gate", `${path}.status`, `${release.status} requires gates.release=PASS.`);
    }
  }
}

function validateConsumers(findings, consumers, path) {
  if (!requireRecord(findings, consumers, path)) return;
  requireExactKeys(findings, consumers, ["status", "checkedAt", "repositories"], path);
  requireEnum(findings, consumers.status, ["NOT_INVENTORIED", "INVENTORIED", "VERIFIED"], `${path}.status`);
  requireDate(findings, consumers.checkedAt, `${path}.checkedAt`, { nullable: true });
  if (requireArray(findings, consumers.repositories, `${path}.repositories`)) {
    for (const [index, repository] of consumers.repositories.entries()) {
      validateRepositoryName(findings, repository, `${path}.repositories[${index}]`);
    }
    for (const duplicate of duplicates(consumers.repositories)) {
      push(findings, "duplicate-consumer", path, `Consumer ${duplicate} is listed more than once.`, { repository: duplicate });
    }
  }
  if (consumers.status === "NOT_INVENTORIED" && consumers.checkedAt !== null) {
    push(findings, "consumer-contradiction", path, "NOT_INVENTORIED must not carry checkedAt.");
  }
  if (["INVENTORIED", "VERIFIED"].includes(consumers.status) && !consumers.checkedAt) {
    push(findings, "consumer-evidence", `${path}.checkedAt`, `${consumers.status} requires checkedAt.`);
  }
}

function validateRollback(findings, rollback, path) {
  if (!requireRecord(findings, rollback, path)) return;
  requireExactKeys(findings, rollback, ["status", "lastRehearsedAt", "evidenceUrl"], path);
  requireEnum(findings, rollback.status, ["NOT_PROVEN", "DOCUMENTED", "REHEARSED", "VERIFIED"], `${path}.status`);
  requireDate(findings, rollback.lastRehearsedAt, `${path}.lastRehearsedAt`, { nullable: true });
  requireString(findings, rollback.evidenceUrl, `${path}.evidenceUrl`, { nullable: true });
  if (rollback.status === "NOT_PROVEN" && (rollback.lastRehearsedAt !== null || rollback.evidenceUrl !== null)) {
    push(findings, "rollback-contradiction", path, "NOT_PROVEN must not carry rehearsal evidence.");
  }
  if (rollback.status === "DOCUMENTED" && !rollback.evidenceUrl) {
    push(findings, "rollback-evidence", `${path}.evidenceUrl`, "DOCUMENTED requires evidenceUrl.");
  }
  if (["REHEARSED", "VERIFIED"].includes(rollback.status) && (!rollback.lastRehearsedAt || !rollback.evidenceUrl)) {
    push(findings, "rollback-evidence", path, `${rollback.status} requires rehearsal date and evidence URL.`);
  }
}

function validateHumanApproval(findings, target, path) {
  const approval = target.humanApproval;
  if (!requireRecord(findings, approval, path)) return;
  requireExactKeys(findings, approval, ["approved", "approver", "approvedAt", "rationale"], path);
  if (typeof approval.approved !== "boolean") push(findings, "type", `${path}.approved`, "Expected a boolean.");
  requireString(findings, approval.approver, `${path}.approver`, { nullable: true });
  requireDate(findings, approval.approvedAt, `${path}.approvedAt`, { nullable: true });
  requireString(findings, approval.rationale, `${path}.rationale`, { nullable: true });

  if (approval.approved) {
    if (!approval.approver || !approval.approvedAt || !approval.rationale || approval.rationale.length < 20) {
      push(findings, "human-approval-evidence", path, "Approval requires approver, approval date, and a substantive rationale.");
    }
    if (target.gates?.humanApproval !== "PASS") {
      push(findings, "human-approval-gate", path, "An approved record requires gates.humanApproval=PASS.");
    }
  } else {
    if ([approval.approver, approval.approvedAt, approval.rationale].some((value) => value !== null)) {
      push(findings, "human-approval-contradiction", path, "Unapproved records must not carry approval metadata.");
    }
    if (target.gates?.humanApproval === "PASS") {
      push(findings, "human-approval-gate", path, "gates.humanApproval=PASS requires a complete approved record.");
    }
  }
}

function validateWaivers(findings, target, path, now) {
  const waivers = target.waivers;
  if (!requireArray(findings, waivers, path)) return;
  const gatesWithWaivers = new Map();
  for (const [index, waiver] of waivers.entries()) {
    const waiverPath = `${path}[${index}]`;
    if (!requireRecord(findings, waiver, waiverPath)) continue;
    requireExactKeys(findings, waiver, ["gate", "approver", "approvedAt", "expiresAt", "rationale"], waiverPath);
    requireString(findings, waiver.gate, `${waiverPath}.gate`);
    requireString(findings, waiver.approver, `${waiverPath}.approver`);
    const approvedAt = requireDate(findings, waiver.approvedAt, `${waiverPath}.approvedAt`);
    const expiresAt = requireDate(findings, waiver.expiresAt, `${waiverPath}.expiresAt`);
    requireString(findings, waiver.rationale, `${waiverPath}.rationale`, { minLength: 20 });
    if (!REQUIRED_GATES.includes(waiver.gate)) {
      push(findings, "waiver-gate", `${waiverPath}.gate`, "Waiver references an unknown gate.");
    }
    if (waiver.gate === "humanApproval") {
      push(findings, "human-approval-waiver", waiverPath, "humanApproval can never be waived.");
    }
    if (approvedAt && expiresAt && approvedAt >= expiresAt) {
      push(findings, "waiver-window", waiverPath, "Waiver expiry must be later than approval time.");
    }
    if (expiresAt && expiresAt <= now) {
      push(findings, "expired-waiver", waiverPath, "Waiver has expired.");
    }
    if (gatesWithWaivers.has(waiver.gate)) {
      push(findings, "duplicate-waiver", waiverPath, `Gate ${waiver.gate} has more than one waiver.`);
    }
    gatesWithWaivers.set(waiver.gate, waiver);
  }

  for (const gate of REQUIRED_GATES) {
    if (target.gates?.[gate] === "WAIVED" && !gatesWithWaivers.has(gate)) {
      push(findings, "missing-waiver", `${path.replace(/\.waivers$/, ".gates")}.${gate}`, `Gate ${gate} is WAIVED without a current waiver record.`);
    }
    if (target.gates?.[gate] !== "WAIVED" && gatesWithWaivers.has(gate)) {
      push(findings, "unused-waiver", path, `A waiver exists for ${gate}, but the gate is not WAIVED.`);
    }
  }
}

function validateGates(findings, gates, path) {
  if (!requireRecord(findings, gates, path)) return;
  requireExactKeys(findings, gates, REQUIRED_GATES, path);
  for (const gate of REQUIRED_GATES) {
    requireEnum(findings, gates[gate], EXACT_VOCABULARY.gate, `${path}.${gate}`);
  }
  if (gates.humanApproval === "WAIVED") {
    push(findings, "human-approval-waiver", `${path}.humanApproval`, "humanApproval can never be WAIVED.");
  }
}

function validateDecision(findings, target, path) {
  const decision = target.decision;
  if (!requireRecord(findings, decision, path)) return;
  requireExactKeys(findings, decision, ["kind", "status", "selectedBase", "candidates", "rationale"], path);
  requireEnum(findings, decision.kind, ["KEEP_AND_CONSOLIDATE", "KEEP_STANDALONE", "MERGE", "ARCHIVE", "DECISION_REQUIRED"], `${path}.kind`);
  requireEnum(findings, decision.status, ["PREPARED", "APPROVED", "REJECTED", "BLOCKED"], `${path}.status`);
  if (decision.selectedBase !== null) validateRepositoryName(findings, decision.selectedBase, `${path}.selectedBase`);
  if (decision.status === "APPROVED" && !decision.selectedBase) {
    push(findings, "decision-base-required", `${path}.selectedBase`, "An APPROVED decision requires a selected base repository.");
  }
  if (requireArray(findings, decision.candidates, `${path}.candidates`)) {
    for (const [index, repository] of decision.candidates.entries()) {
      validateRepositoryName(findings, repository, `${path}.candidates[${index}]`);
    }
    for (const duplicate of duplicates(decision.candidates)) {
      push(findings, "duplicate-decision-candidate", path, `Candidate ${duplicate} is repeated.`);
    }
  }
  requireString(findings, decision.rationale, `${path}.rationale`, { minLength: 20 });
  if (decision.selectedBase && !decision.candidates?.includes(decision.selectedBase)) {
    push(findings, "decision-base", `${path}.selectedBase`, "selectedBase must be included in candidates.");
  }
  if (decision.status === "APPROVED" && target.gates?.decision !== "PASS") {
    push(findings, "decision-gate", path, "APPROVED decision requires gates.decision=PASS.");
  }
  if (target.gates?.decision === "PASS" && decision.status !== "APPROVED") {
    push(findings, "decision-gate", path, "gates.decision=PASS requires an APPROVED decision.");
  }
}

function validateImplementationRef(findings, implementationRef, path) {
  if (!requireRecord(findings, implementationRef, path)) return;
  requireExactKeys(findings, implementationRef, ["kind", "repository", "ref"], path);
  requireEnum(findings, implementationRef.kind, ["MAIN", "DRAFT_PR", "MAIN_OR_DRAFT_UNVERIFIED", "BASE_CANDIDATE", "NONE"], `${path}.kind`);
  if (implementationRef.repository !== null) validateRepositoryName(findings, implementationRef.repository, `${path}.repository`);
  requireString(findings, implementationRef.ref, `${path}.ref`, { nullable: true });
  if (implementationRef.kind === "NONE" && (implementationRef.repository !== null || implementationRef.ref !== null)) {
    push(findings, "implementation-ref", path, "NONE requires repository=null and ref=null.");
  }
  if (["MAIN", "DRAFT_PR"].includes(implementationRef.kind) && (!implementationRef.repository || !implementationRef.ref)) {
    push(findings, "implementation-ref", path, `${implementationRef.kind} requires repository and an immutable or reviewable ref.`);
  }
}

function sourceStateRequiresImportEvidence(state) {
  return [
    "MIGRATION_IN_PROGRESS",
    "TARGET_RELEASED",
    "REDIRECTED",
    "ARCHIVE_CANDIDATE",
    "ARCHIVE_APPROVED",
    "ARCHIVED",
  ].includes(state);
}

function validateSource(findings, source, path, target) {
  if (!requireRecord(findings, source, path)) return;
  requireExactKeys(findings, source, ["repository", "role", "state", "sourceSha", "treeSha", "targetPath", "importCommit"], path);
  validateRepositoryName(findings, source.repository, `${path}.repository`);
  requireEnum(findings, source.role, ["SOURCE", "TARGET"], `${path}.role`);
  requireEnum(findings, source.state, EXACT_VOCABULARY.source, `${path}.state`);
  validateSha(findings, source.sourceSha, `${path}.sourceSha`);
  validateSha(findings, source.treeSha, `${path}.treeSha`);
  requireString(findings, source.targetPath, `${path}.targetPath`, { nullable: true });
  validateSha(findings, source.importCommit, `${path}.importCommit`);

  if (source.repository === target.canonicalRepository && source.role !== "TARGET") {
    push(findings, "source-role", `${path}.role`, "A canonical repository listed as a source must use role=TARGET.");
  }
  if (source.role === "TARGET" && source.repository !== target.canonicalRepository) {
    push(findings, "source-role", `${path}.role`, "role=TARGET is reserved for the canonical repository.");
  }
  if (sourceStateRequiresImportEvidence(source.state)) {
    if (!source.sourceSha || !source.treeSha || !source.targetPath || !source.importCommit) {
      push(findings, "import-evidence", path, `${source.state} requires source SHA, tree SHA, target path, and import commit.`);
    }
    if (target.gates?.import !== "PASS") {
      push(findings, "import-gate", path, `${source.state} requires gates.import=PASS.`);
    }
  }

  if (["TARGET_RELEASED", "REDIRECTED", "ARCHIVE_CANDIDATE", "ARCHIVE_APPROVED", "ARCHIVED"].includes(source.state)) {
    if (!["RELEASED", "VERIFIED"].includes(target.release?.status) || target.gates?.release !== "PASS") {
      push(findings, "source-release-gate", path, `${source.state} requires an installable target release and gates.release=PASS.`);
    }
  }
  if (["REDIRECTED", "ARCHIVE_CANDIDATE", "ARCHIVE_APPROVED", "ARCHIVED"].includes(source.state) && target.gates?.redirect !== "PASS") {
    push(findings, "redirect-gate", path, `${source.state} requires gates.redirect=PASS.`);
  }
  if (["ARCHIVE_CANDIDATE", "ARCHIVE_APPROVED", "ARCHIVED"].includes(source.state)) {
    for (const gate of TECHNICAL_ARCHIVE_GATES) {
      if (target.gates?.[gate] !== "PASS") {
        push(findings, "archive-gate", path, `${source.state} requires ${gate}=PASS.`, { gate, repository: source.repository, target: target.id });
      }
    }
  }
  if (["ARCHIVE_APPROVED", "ARCHIVED"].includes(source.state)) {
    if (target.gates?.humanApproval !== "PASS" || !target.humanApproval?.approved) {
      push(findings, "archive-gate", path, `${source.state} requires named human approval.`, { gate: "humanApproval", repository: source.repository, target: target.id });
    }
  }
  if (source.state === "ARCHIVED" && target.status !== "VERIFIED") {
    push(findings, "archive-target-state", path, "ARCHIVED requires the canonical target to be VERIFIED.");
  }
}

function validateTargetStatus(findings, target, path) {
  const gates = target.gates ?? {};
  if (target.status === "READY") {
    for (const gate of ["decision", "import", "compatibility"]) {
      if (gates[gate] !== "PASS") push(findings, "target-ready-gate", path, `READY requires ${gate}=PASS.`);
    }
  }
  if (target.status === "RELEASED") {
    for (const gate of ["decision", "import", "compatibility", "release"]) {
      if (gates[gate] !== "PASS") push(findings, "target-release-gate", path, `RELEASED requires ${gate}=PASS.`);
    }
    if (!["RELEASED", "VERIFIED"].includes(target.release?.status)) {
      push(findings, "target-release-state", path, "Target RELEASED requires release.status RELEASED or VERIFIED.");
    }
  }
  if (target.status === "VERIFIED") {
    for (const gate of REQUIRED_GATES) {
      if (gates[gate] !== "PASS") push(findings, "target-verified-gate", path, `VERIFIED requires ${gate}=PASS.`);
    }
    if (target.release?.status !== "VERIFIED") push(findings, "target-verified-release", path, "VERIFIED target requires release.status=VERIFIED.");
    if (target.consumers?.status !== "VERIFIED") push(findings, "target-verified-consumers", path, "VERIFIED target requires consumers.status=VERIFIED.");
    if (target.rollback?.status !== "VERIFIED") push(findings, "target-verified-rollback", path, "VERIFIED target requires rollback.status=VERIFIED.");
    if (!target.humanApproval?.approved) push(findings, "target-verified-human", path, "VERIFIED target requires named human approval.");
    if (target.evidence?.status !== "VERIFIED") push(findings, "target-verified-evidence", path, "VERIFIED target requires current VERIFIED evidence.");
    if (Object.values(gates).includes("WAIVED")) push(findings, "target-verified-waiver", path, "VERIFIED cannot rely on waived gates.");
  }
}

function validateTarget(findings, target, index, now) {
  const path = `portfolio/targets.json.targets[${index}]`;
  if (!requireRecord(findings, target, path)) return;
  requireExactKeys(findings, target, [
    "id",
    "canonicalRepository",
    "companionRepositories",
    "owner",
    "priority",
    "status",
    "maturity",
    "evidence",
    "risk",
    "decision",
    "implementationRef",
    "sources",
    "release",
    "consumers",
    "rollback",
    "humanApproval",
    "waivers",
    "gates",
  ], path);
  validateRepositoryName(findings, target.id, `${path}.id`);
  validateRepositoryName(findings, target.canonicalRepository, `${path}.canonicalRepository`);
  requireString(findings, target.owner, `${path}.owner`);
  requireEnum(findings, target.priority, ["P0", "P1", "P2", "P3"], `${path}.priority`);
  requireEnum(findings, target.status, EXACT_VOCABULARY.target, `${path}.status`);
  requireEnum(findings, target.maturity, ["EXPERIMENTAL", "PROTOTYPE", "BETA", "STABLE", "DEPRECATED"], `${path}.maturity`);
  requireString(findings, target.risk, `${path}.risk`, { minLength: 20 });

  if (requireArray(findings, target.companionRepositories, `${path}.companionRepositories`)) {
    for (const [companionIndex, repository] of target.companionRepositories.entries()) {
      validateRepositoryName(findings, repository, `${path}.companionRepositories[${companionIndex}]`);
    }
    for (const duplicate of duplicates(target.companionRepositories)) {
      push(findings, "duplicate-companion", `${path}.companionRepositories`, `Companion ${duplicate} is repeated.`);
    }
  }

  validateEvidence(findings, target.evidence, `${path}.evidence`, now);
  validateGates(findings, target.gates, `${path}.gates`);
  validateDecision(findings, target, `${path}.decision`);
  validateImplementationRef(findings, target.implementationRef, `${path}.implementationRef`);
  validateRelease(findings, target, `${path}.release`);
  validateConsumers(findings, target.consumers, `${path}.consumers`);
  validateRollback(findings, target.rollback, `${path}.rollback`);
  validateHumanApproval(findings, target, `${path}.humanApproval`);
  validateWaivers(findings, target, `${path}.waivers`, now);

  if (requireArray(findings, target.sources, `${path}.sources`)) {
    for (const [sourceIndex, source] of target.sources.entries()) {
      validateSource(findings, source, `${path}.sources[${sourceIndex}]`, target);
    }
    const targetSources = target.sources.filter((source) => source?.role === "TARGET");
    if (targetSources.length > 1) push(findings, "multiple-target-sources", `${path}.sources`, "At most one source entry may use role=TARGET.");
    if (target.sources.some((source) => source?.repository === target.canonicalRepository) && targetSources.length !== 1) {
      push(findings, "canonical-source-role", `${path}.sources`, "Canonical repository membership requires exactly one role=TARGET entry.");
    }
  }

  if (target.implementationRef?.repository) {
    const allowed = new Set([
      target.canonicalRepository,
      ...asArray(target.companionRepositories),
      ...asArray(target.sources).map((source) => source?.repository).filter(Boolean),
    ]);
    if (!allowed.has(target.implementationRef.repository)) {
      push(findings, "implementation-repository", `${path}.implementationRef.repository`, "Implementation repository is not registered under this target.");
    }
  }

  validateTargetStatus(findings, target, path);
}

function validateTargetsDocument(findings, targetsDocument, now) {
  const path = REQUIRED_FILES.targets;
  if (!requireRecord(findings, targetsDocument, path)) return { targetIds: new Set(), sourceToTarget: new Map(), registered: new Set() };
  requireExactKeys(findings, targetsDocument, [
    "schemaVersion",
    "owner",
    "scope",
    "generatedAt",
    "observedAt",
    "expiresAt",
    "expectedTargetCount",
    "expectedSourceRepositoryCount",
    "expectedPublicRepositoryCount",
    "statusVocabulary",
    "standaloneRepositories",
    "targets",
  ], path);
  if (targetsDocument.schemaVersion !== 1) push(findings, "schema-version", `${path}.schemaVersion`, "Expected schemaVersion=1.");
  requireString(findings, targetsDocument.owner, `${path}.owner`, { pattern: /^[A-Za-z0-9-]+$/ });
  if (targetsDocument.scope !== "PUBLIC_ONLY") push(findings, "scope", `${path}.scope`, "Registry scope must be PUBLIC_ONLY.");
  const generatedAt = requireDate(findings, targetsDocument.generatedAt, `${path}.generatedAt`);
  const observedAt = requireDate(findings, targetsDocument.observedAt, `${path}.observedAt`);
  const expiresAt = requireDate(findings, targetsDocument.expiresAt, `${path}.expiresAt`);
  if (generatedAt && observedAt && generatedAt < observedAt) {
    push(findings, "registry-time", path, "generatedAt must be at or after observedAt.");
  }
  if (observedAt && expiresAt && observedAt >= expiresAt) {
    push(findings, "registry-window", path, "expiresAt must be later than observedAt.");
  }
  if (expiresAt && expiresAt <= now) {
    push(findings, "stale-registry", path, "The canonical registry snapshot has expired.");
  }
  requireInteger(findings, targetsDocument.expectedTargetCount, `${path}.expectedTargetCount`, 1);
  requireInteger(findings, targetsDocument.expectedSourceRepositoryCount, `${path}.expectedSourceRepositoryCount`, 1);
  requireInteger(findings, targetsDocument.expectedPublicRepositoryCount, `${path}.expectedPublicRepositoryCount`, 1);

  if (requireRecord(findings, targetsDocument.statusVocabulary, `${path}.statusVocabulary`)) {
    requireExactKeys(findings, targetsDocument.statusVocabulary, Object.keys(EXACT_VOCABULARY), `${path}.statusVocabulary`);
    for (const [kind, expected] of Object.entries(EXACT_VOCABULARY)) {
      const actual = targetsDocument.statusVocabulary[kind];
      if (!Array.isArray(actual) || !sameSet(actual, expected) || actual.length !== expected.length) {
        push(findings, "status-vocabulary", `${path}.statusVocabulary.${kind}`, "Status vocabulary must match the validator's exact versioned vocabulary.");
      }
    }
  }

  const targetIds = new Set();
  const canonicalRepositories = [];
  const sourceRepositories = [];
  const sourceToTarget = new Map();
  const companionRepositories = [];
  const standaloneRepositories = [];

  if (requireArray(findings, targetsDocument.targets, `${path}.targets`)) {
    for (const [index, target] of targetsDocument.targets.entries()) {
      validateTarget(findings, target, index, now);
      if (!isRecord(target)) continue;
      if (targetIds.has(target.id)) push(findings, "duplicate-target", `${path}.targets[${index}].id`, `Target ${target.id} is duplicated.`, { target: target.id });
      targetIds.add(target.id);
      canonicalRepositories.push(target.canonicalRepository);
      for (const repository of asArray(target.companionRepositories)) companionRepositories.push(repository);
      for (const source of asArray(target.sources)) {
        if (!isRecord(source) || typeof source.repository !== "string") continue;
        sourceRepositories.push(source.repository);
        if (sourceToTarget.has(source.repository)) {
          push(findings, "duplicate-source", `${path}.targets[${index}].sources`, `Source repository ${source.repository} belongs to more than one target.`, {
            repository: source.repository,
            target: target.id,
            otherTarget: sourceToTarget.get(source.repository),
          });
        } else {
          sourceToTarget.set(source.repository, target.id);
        }
      }
    }
  }

  for (const duplicate of duplicates(canonicalRepositories)) {
    push(findings, "duplicate-canonical", `${path}.targets`, `Canonical repository ${duplicate} is used by more than one target.`, { repository: duplicate });
  }
  for (const duplicate of duplicates(companionRepositories)) {
    push(findings, "duplicate-companion-global", `${path}.targets`, `Companion repository ${duplicate} is registered more than once.`, { repository: duplicate });
  }

  if (requireArray(findings, targetsDocument.standaloneRepositories, `${path}.standaloneRepositories`)) {
    for (const [index, standalone] of targetsDocument.standaloneRepositories.entries()) {
      const standalonePath = `${path}.standaloneRepositories[${index}]`;
      if (!requireRecord(findings, standalone, standalonePath)) continue;
      requireExactKeys(findings, standalone, ["repository", "state", "decision", "owner", "evidenceStatus"], standalonePath);
      validateRepositoryName(findings, standalone.repository, `${standalonePath}.repository`);
      requireEnum(findings, standalone.state, ["ACTIVE", "DECISION_REQUIRED", "DEPRECATED", "ARCHIVED"], `${standalonePath}.state`);
      requireString(findings, standalone.decision, `${standalonePath}.decision`);
      requireString(findings, standalone.owner, `${standalonePath}.owner`);
      requireEnum(findings, standalone.evidenceStatus, EXACT_VOCABULARY.evidence, `${standalonePath}.evidenceStatus`);
      standaloneRepositories.push(standalone.repository);
      if (standalone.state === "ARCHIVED") {
        push(findings, "standalone-archive", standalonePath, "Standalone archive cannot be proven by this record; map it to a fully gated target first.");
      }
    }
  }
  for (const duplicate of duplicates(standaloneRepositories)) {
    push(findings, "duplicate-standalone", `${path}.standaloneRepositories`, `Standalone repository ${duplicate} is repeated.`, { repository: duplicate });
  }

  if (targetsDocument.targets?.length !== targetsDocument.expectedTargetCount) {
    push(findings, "target-count", `${path}.expectedTargetCount`, `Expected ${targetsDocument.expectedTargetCount} targets but found ${targetsDocument.targets?.length ?? 0}.`);
  }
  if (sourceRepositories.length !== targetsDocument.expectedSourceRepositoryCount) {
    push(findings, "source-count", `${path}.expectedSourceRepositoryCount`, `Expected ${targetsDocument.expectedSourceRepositoryCount} source memberships but found ${sourceRepositories.length}.`);
  }
  if (new Set(sourceRepositories).size !== targetsDocument.expectedSourceRepositoryCount) {
    push(findings, "unique-source-count", `${path}.expectedSourceRepositoryCount`, `Expected ${targetsDocument.expectedSourceRepositoryCount} unique source repositories but found ${new Set(sourceRepositories).size}.`);
  }

  const registered = new Set([
    ...sourceRepositories,
    ...canonicalRepositories,
    ...companionRepositories,
    ...standaloneRepositories,
  ]);
  if (registered.size !== targetsDocument.expectedPublicRepositoryCount) {
    push(findings, "public-repository-count", `${path}.expectedPublicRepositoryCount`, `Expected ${targetsDocument.expectedPublicRepositoryCount} registered public repositories but derived ${registered.size}.`);
  }

  const crossRoleDuplicates = duplicates([
    ...canonicalRepositories,
    ...companionRepositories,
    ...standaloneRepositories,
  ]);
  for (const duplicate of crossRoleDuplicates) {
    const canonicalCount = canonicalRepositories.filter((value) => value === duplicate).length;
    const companionCount = companionRepositories.filter((value) => value === duplicate).length;
    const standaloneCount = standaloneRepositories.filter((value) => value === duplicate).length;
    if (canonicalCount + companionCount + standaloneCount > 1) {
      push(findings, "repository-role-collision", path, `Repository ${duplicate} is registered in conflicting canonical/companion/standalone roles.`, { repository: duplicate });
    }
  }

  return { targetIds, sourceToTarget, registered };
}

function detectDependencyCycles(actions) {
  const byId = new Map(actions.map((action) => [action.id, action]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(id, stack) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    const next = byId.get(id);
    for (const dependency of asArray(next.dependsOn)) visit(dependency, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of byId.keys()) visit(id, []);
  return cycles;
}

function validateActionsDocument(findings, actionsDocument, targetIds) {
  const path = REQUIRED_FILES.actions;
  if (!requireRecord(findings, actionsDocument, path)) return;
  requireExactKeys(findings, actionsDocument, ["schemaVersion", "generatedAt", "definitionOfDone", "actions"], path);
  if (actionsDocument.schemaVersion !== 1) push(findings, "schema-version", `${path}.schemaVersion`, "Expected schemaVersion=1.");
  requireDate(findings, actionsDocument.generatedAt, `${path}.generatedAt`);
  const exactDone = ["PREPARED", "MERGED", "TAGGED", "RELEASED", "VERIFIED"];
  if (!Array.isArray(actionsDocument.definitionOfDone) || actionsDocument.definitionOfDone.length !== exactDone.length || actionsDocument.definitionOfDone.some((value, index) => value !== exactDone[index])) {
    push(findings, "definition-of-done", `${path}.definitionOfDone`, `Expected ordered states: ${exactDone.join(", ")}.`);
  }

  const actions = asArray(actionsDocument.actions);
  if (!Array.isArray(actionsDocument.actions)) push(findings, "type", `${path}.actions`, "Expected an array.");
  const actionIds = actions.map((action) => action?.id).filter((value) => typeof value === "string");
  for (const duplicate of duplicates(actionIds)) {
    push(findings, "duplicate-action", `${path}.actions`, `Action ${duplicate} is duplicated.`, { action: duplicate });
  }
  const actionIdSet = new Set(actionIds);

  for (const [index, action] of actions.entries()) {
    const actionPath = `${path}.actions[${index}]`;
    if (!requireRecord(findings, action, actionPath)) continue;
    requireExactKeys(findings, action, ["id", "priority", "target", "title", "status", "owner", "dependsOn", "dueAt", "verification", "counterProof", "closureEvidence", "rollback"], actionPath);
    const match = typeof action.id === "string" ? ACTION_ID.exec(action.id) : null;
    if (!match) push(findings, "action-id", `${actionPath}.id`, "Action ID must match P0-000 through P3-999.");
    requireEnum(findings, action.priority, ["P0", "P1", "P2", "P3"], `${actionPath}.priority`);
    if (match && action.priority !== `P${match[1]}`) push(findings, "action-priority", actionPath, "Action priority must match its ID prefix.");
    requireString(findings, action.target, `${actionPath}.target`);
    if (action.target !== "portfolio" && !targetIds.has(action.target)) {
      push(findings, "action-target", `${actionPath}.target`, `Action references unknown target ${action.target}.`);
    }
    requireString(findings, action.title, `${actionPath}.title`, { minLength: 10 });
    requireEnum(findings, action.status, ["PREPARED", "IN_PROGRESS", "BLOCKED", "VERIFIED", "CANCELLED"], `${actionPath}.status`);
    requireString(findings, action.owner, `${actionPath}.owner`);
    requireDate(findings, action.dueAt, `${actionPath}.dueAt`);
    requireString(findings, action.verification, `${actionPath}.verification`, { minLength: 10 });
    requireString(findings, action.counterProof, `${actionPath}.counterProof`, { minLength: 10 });
    requireString(findings, action.rollback, `${actionPath}.rollback`, { minLength: 10 });
    if (requireArray(findings, action.dependsOn, `${actionPath}.dependsOn`)) {
      for (const [dependencyIndex, dependency] of action.dependsOn.entries()) {
        requireString(findings, dependency, `${actionPath}.dependsOn[${dependencyIndex}]`, { pattern: ACTION_ID });
        if (!actionIdSet.has(dependency)) push(findings, "action-dependency", `${actionPath}.dependsOn[${dependencyIndex}]`, `Unknown dependency ${dependency}.`);
        if (dependency === action.id) push(findings, "action-self-dependency", `${actionPath}.dependsOn[${dependencyIndex}]`, "Action cannot depend on itself.");
      }
      for (const duplicate of duplicates(action.dependsOn)) {
        push(findings, "duplicate-action-dependency", `${actionPath}.dependsOn`, `Dependency ${duplicate} is repeated.`);
      }
    }
    if (requireArray(findings, action.closureEvidence, `${actionPath}.closureEvidence`)) {
      for (const [evidenceIndex, evidence] of action.closureEvidence.entries()) {
        requireString(findings, evidence, `${actionPath}.closureEvidence[${evidenceIndex}]`);
      }
      if (action.status === "VERIFIED" && action.closureEvidence.length === 0) {
        push(findings, "action-closure-evidence", actionPath, "VERIFIED action requires immutable closure evidence.");
      }
    }
  }

  for (const cycle of detectDependencyCycles(actions.filter(isRecord))) {
    push(findings, "action-dependency-cycle", `${path}.actions`, `Dependency cycle detected: ${cycle.join(" -> ")}.`);
  }
}

function validateFreezeDocument(findings, freeze) {
  const path = REQUIRED_FILES.freeze;
  if (!requireRecord(findings, freeze, path)) return;
  requireExactKeys(findings, freeze, ["schemaVersion", "active", "reason", "activatedAt", "reviewAt", "limits", "blockedActions", "exceptions", "humanApprovalRequiredFor", "automaticMutation"], path);
  if (freeze.schemaVersion !== 1) push(findings, "schema-version", `${path}.schemaVersion`, "Expected schemaVersion=1.");
  if (freeze.active !== true) push(findings, "freeze-disabled", `${path}.active`, "Freeze must remain active until a separately recorded human-approved transition exists.");
  requireString(findings, freeze.reason, `${path}.reason`, { minLength: 20 });
  const activatedAt = requireDate(findings, freeze.activatedAt, `${path}.activatedAt`);
  const reviewAt = requireDate(findings, freeze.reviewAt, `${path}.reviewAt`);
  if (activatedAt && reviewAt && reviewAt <= activatedAt) push(findings, "freeze-window", path, "reviewAt must be later than activatedAt.");
  if (freeze.automaticMutation !== false) push(findings, "automatic-mutation", `${path}.automaticMutation`, "Portfolio policy must never automatically merge, close, archive, release, or unfreeze.");

  if (requireRecord(findings, freeze.limits, `${path}.limits`)) {
    requireExactKeys(findings, freeze.limits, ["maxOpenPullRequests", "maxActiveConsolidations", "maxDraftAgeDays", "maxEvidenceAgeDays"], `${path}.limits`);
    for (const limit of ["maxOpenPullRequests", "maxActiveConsolidations", "maxDraftAgeDays", "maxEvidenceAgeDays"]) {
      requireInteger(findings, freeze.limits[limit], `${path}.limits.${limit}`, 1);
    }
  }

  if (requireArray(findings, freeze.blockedActions, `${path}.blockedActions`)) {
    for (const required of REQUIRED_FREEZE_BLOCKS) {
      if (!freeze.blockedActions.includes(required)) push(findings, "freeze-block", `${path}.blockedActions`, `Missing required blocked action ${required}.`);
    }
    for (const duplicate of duplicates(freeze.blockedActions)) push(findings, "duplicate-freeze-block", `${path}.blockedActions`, `Blocked action ${duplicate} is repeated.`);
  }
  if (requireArray(findings, freeze.humanApprovalRequiredFor, `${path}.humanApprovalRequiredFor`)) {
    for (const required of REQUIRED_HUMAN_APPROVAL_ACTIONS) {
      if (!freeze.humanApprovalRequiredFor.includes(required)) push(findings, "freeze-human-gate", `${path}.humanApprovalRequiredFor`, `Missing required human-gated action ${required}.`);
    }
  }
  if (requireArray(findings, freeze.exceptions, `${path}.exceptions`)) {
    for (const [index, exception] of freeze.exceptions.entries()) {
      const exceptionPath = `${path}.exceptions[${index}]`;
      if (!requireRecord(findings, exception, exceptionPath)) continue;
      requireExactKeys(findings, exception, ["id", "requiresHumanApproval", "requiresEvidence"], exceptionPath);
      requireString(findings, exception.id, `${exceptionPath}.id`);
      if (exception.requiresHumanApproval !== true || exception.requiresEvidence !== true) {
        push(findings, "freeze-exception", exceptionPath, "Every freeze exception requires both human approval and evidence.");
      }
    }
  }
}

function validateTriageDocument(findings, triage) {
  const path = REQUIRED_FILES.triage;
  if (!requireRecord(findings, triage, path)) return;
  requireExactKeys(findings, triage, ["schemaVersion", "autoClose", "autoMerge", "categories", "supersession"], path);
  if (triage.schemaVersion !== 1) push(findings, "schema-version", `${path}.schemaVersion`, "Expected schemaVersion=1.");
  if (triage.autoClose !== false) push(findings, "triage-auto-close", `${path}.autoClose`, "Pull requests must not be closed automatically.");
  if (triage.autoMerge !== false) push(findings, "triage-auto-merge", `${path}.autoMerge`, "Pull requests must not be merged automatically.");

  const categoryIds = [];
  const precedences = [];
  if (requireArray(findings, triage.categories, `${path}.categories`)) {
    for (const [index, category] of triage.categories.entries()) {
      const categoryPath = `${path}.categories[${index}]`;
      if (!requireRecord(findings, category, categoryPath)) continue;
      requireExactKeys(findings, category, ["id", "precedence", "slaHours", "patterns", "action"], categoryPath);
      requireString(findings, category.id, `${categoryPath}.id`);
      requireInteger(findings, category.precedence, `${categoryPath}.precedence`, 1);
      requireInteger(findings, category.slaHours, `${categoryPath}.slaHours`, 1);
      requireString(findings, category.action, `${categoryPath}.action`);
      categoryIds.push(category.id);
      precedences.push(category.precedence);
      if (requireArray(findings, category.patterns, `${categoryPath}.patterns`)) {
        for (const [patternIndex, pattern] of category.patterns.entries()) requireString(findings, pattern, `${categoryPath}.patterns[${patternIndex}]`);
      }
    }
  }
  for (const id of REQUIRED_TRIAGE_CATEGORIES) {
    if (!categoryIds.includes(id)) push(findings, "triage-category", `${path}.categories`, `Missing required category ${id}.`);
  }
  for (const duplicate of duplicates(categoryIds)) push(findings, "duplicate-triage-category", `${path}.categories`, `Category ${duplicate} is repeated.`);
  for (const duplicate of duplicates(precedences)) push(findings, "duplicate-triage-precedence", `${path}.categories`, `Precedence ${duplicate} is repeated.`);

  if (requireRecord(findings, triage.supersession, `${path}.supersession`)) {
    requireExactKeys(findings, triage.supersession, ["requiresTargetRelease", "requiresUsefulChangePorted", "requiresHumanClosure", "closeAutomatically"], `${path}.supersession`);
    for (const property of ["requiresTargetRelease", "requiresUsefulChangePorted", "requiresHumanClosure"]) {
      if (triage.supersession[property] !== true) push(findings, "supersession-safeguard", `${path}.supersession.${property}`, `${property} must remain true.`);
    }
    if (triage.supersession.closeAutomatically !== false) push(findings, "supersession-auto-close", `${path}.supersession.closeAutomatically`, "Superseded candidates require human closure.");
  }
}

function validateAgentOpsDocument(findings, agentops, targetsDocument, now) {
  const path = REQUIRED_FILES.agentops;
  if (!requireRecord(findings, agentops, path)) return;
  requireExactKeys(findings, agentops, [
    "schemaVersion",
    "target",
    "status",
    "selectedBase",
    "selectedBaseEvidence",
    "implementationRef",
    "moduleMapping",
    "receipts",
    "nonGoals",
    "gates",
  ], path);
  if (agentops.schemaVersion !== 2) push(findings, "schema-version", `${path}.schemaVersion`, "Expected schemaVersion=2.");
  if (agentops.target !== "agentops") push(findings, "agentops-target", `${path}.target`, "Expected target=agentops.");
  requireEnum(findings, agentops.status, ["PREPARED", "APPROVED", "REJECTED", "BLOCKED"], `${path}.status`);
  validateRepositoryName(findings, agentops.selectedBase, `${path}.selectedBase`);

  const target = asArray(targetsDocument?.targets).find((candidate) => candidate?.id === "agentops");
  if (!target) {
    push(findings, "agentops-registry", path, "targets.json does not contain the canonical agentops target.");
    return;
  }
  if (agentops.selectedBase !== target.canonicalRepository || agentops.selectedBase !== target.decision?.selectedBase) {
    push(findings, "agentops-base-drift", `${path}.selectedBase`, "AgentOps selected base must match canonicalRepository and decision.selectedBase in targets.json.");
  }
  const targetSources = new Set(asArray(target.sources).map((source) => source?.repository).filter(Boolean));
  if (!targetSources.has(agentops.selectedBase)) {
    push(findings, "agentops-new-repository", `${path}.selectedBase`, "AgentOps base must be one of the existing source repositories during the freeze.");
  }

  if (requireRecord(findings, agentops.selectedBaseEvidence, `${path}.selectedBaseEvidence`)) {
    requireExactKeys(findings, agentops.selectedBaseEvidence, ["observedAt", "expiresAt", "properties"], `${path}.selectedBaseEvidence`);
    const observedAt = requireDate(findings, agentops.selectedBaseEvidence.observedAt, `${path}.selectedBaseEvidence.observedAt`);
    const expiresAt = requireDate(findings, agentops.selectedBaseEvidence.expiresAt, `${path}.selectedBaseEvidence.expiresAt`);
    if (observedAt && expiresAt && observedAt >= expiresAt) push(findings, "agentops-evidence-window", `${path}.selectedBaseEvidence`, "Evidence expiry must be later than observation.");
    if (expiresAt && expiresAt <= now) push(findings, "stale-agentops-evidence", `${path}.selectedBaseEvidence`, "AgentOps base evidence has expired.");
    if (requireArray(findings, agentops.selectedBaseEvidence.properties, `${path}.selectedBaseEvidence.properties`)) {
      if (agentops.selectedBaseEvidence.properties.length < 5) push(findings, "agentops-evidence-depth", `${path}.selectedBaseEvidence.properties`, "Base decision requires multiple explicit observed properties.");
      for (const [index, property] of agentops.selectedBaseEvidence.properties.entries()) requireString(findings, property, `${path}.selectedBaseEvidence.properties[${index}]`);
    }
  }

  if (requireRecord(findings, agentops.implementationRef, `${path}.implementationRef`)) {
    const referencePath = `${path}.implementationRef`;
    requireExactKeys(findings, agentops.implementationRef, ["kind", "repository", "pullRequest", "headSha", "ciRun", "ciStatus", "observedAt", "expiresAt"], referencePath);
    requireEnum(findings, agentops.implementationRef.kind, ["DRAFT_PR"], `${referencePath}.kind`);
    validateRepositoryName(findings, agentops.implementationRef.repository, `${referencePath}.repository`);
    requireInteger(findings, agentops.implementationRef.pullRequest, `${referencePath}.pullRequest`, 1);
    validateSha(findings, agentops.implementationRef.headSha, `${referencePath}.headSha`, { nullable: false });
    requireInteger(findings, agentops.implementationRef.ciRun, `${referencePath}.ciRun`, 1);
    requireEnum(findings, agentops.implementationRef.ciStatus, ["PASS", "BLOCKED", "NOT_RUN"], `${referencePath}.ciStatus`);
    const observedAt = requireDate(findings, agentops.implementationRef.observedAt, `${referencePath}.observedAt`);
    const expiresAt = requireDate(findings, agentops.implementationRef.expiresAt, `${referencePath}.expiresAt`);
    if (observedAt && expiresAt && observedAt >= expiresAt) push(findings, "agentops-implementation-window", referencePath, "Implementation evidence expiry must be later than observation.");
    if (expiresAt && expiresAt <= now) push(findings, "stale-agentops-implementation", referencePath, "AgentOps implementation evidence has expired.");
    if (agentops.implementationRef.repository !== target.implementationRef?.repository) {
      push(findings, "agentops-implementation-drift", `${referencePath}.repository`, "Decision and target implementation repositories differ.");
    }
    if (!String(target.implementationRef?.ref ?? "").includes(String(agentops.implementationRef.headSha ?? ""))) {
      push(findings, "agentops-implementation-drift", `${referencePath}.headSha`, "Target implementationRef is not bound to the recorded AgentOps head.");
    }
  }

  const mappedRepositories = [];
  const modules = [];
  let selectedBaseCount = 0;
  if (requireArray(findings, agentops.moduleMapping, `${path}.moduleMapping`)) {
    for (const [index, mapping] of agentops.moduleMapping.entries()) {
      const mappingPath = `${path}.moduleMapping[${index}]`;
      if (!requireRecord(findings, mapping, mappingPath)) continue;
      requireExactKeys(findings, mapping, ["repository", "module", "disposition"], mappingPath);
      validateRepositoryName(findings, mapping.repository, `${mappingPath}.repository`);
      requireString(findings, mapping.module, `${mappingPath}.module`, { pattern: /^[a-z][a-z0-9_]*$/ });
      requireEnum(findings, mapping.disposition, ["SELECTED_BASE", "COMPARE_AND_DEDUPLICATE", "IMPORT_AFTER_CONTRACT_TESTS", "IMPORT_AFTER_SCHEMA_REVIEW", "IMPORT_AFTER_REDACTION_REVIEW", "IMPORT_AS_TEST_LAB"], `${mappingPath}.disposition`);
      mappedRepositories.push(mapping.repository);
      modules.push(mapping.module);
      if (mapping.disposition === "SELECTED_BASE") {
        selectedBaseCount += 1;
        if (mapping.repository !== agentops.selectedBase) push(findings, "agentops-selected-base-map", mappingPath, "SELECTED_BASE mapping must point to selectedBase.");
      }
    }
  }
  for (const duplicate of duplicates(mappedRepositories)) push(findings, "duplicate-agentops-repository", `${path}.moduleMapping`, `Repository ${duplicate} is mapped more than once.`);
  for (const duplicate of duplicates(modules)) push(findings, "duplicate-agentops-module", `${path}.moduleMapping`, `Module ${duplicate} is mapped more than once.`);
  if (!sameSet(mappedRepositories, [...targetSources]) || mappedRepositories.length !== targetSources.size) {
    push(findings, "agentops-membership-drift", `${path}.moduleMapping`, "AgentOps module mapping must cover exactly the thirteen registered source repositories.");
  }
  if (selectedBaseCount !== 1) push(findings, "agentops-selected-base-count", `${path}.moduleMapping`, "Exactly one module must be SELECTED_BASE.");

  const receiptKeys = ["inventory", "routing", "contextBudget", "quotaSimulation", "sessionRecord", "circuitSimulation", "inboxProjection"];
  if (requireRecord(findings, agentops.receipts, `${path}.receipts`)) {
    requireExactKeys(findings, agentops.receipts, receiptKeys, `${path}.receipts`);
    for (const key of receiptKeys) validateDigest(findings, agentops.receipts[key], `${path}.receipts.${key}`, { nullable: false });
  }

  if (requireArray(findings, agentops.nonGoals, `${path}.nonGoals`)) {
    if (agentops.nonGoals.length < 3) push(findings, "agentops-non-goals", `${path}.nonGoals`, "AgentOps decision requires explicit safety non-goals.");
    for (const [index, nonGoal] of agentops.nonGoals.entries()) requireString(findings, nonGoal, `${path}.nonGoals[${index}]`, { minLength: 10 });
  }

  if (requireRecord(findings, agentops.gates, `${path}.gates`)) {
    const gateKeys = [
      "humanDecision",
      "sourceShaInventory",
      "collisionReport",
      "compatibilityContract",
      "contractRehearsal",
      "sourceHistoryImport",
      "consumerInventory",
      "release",
      "redirect",
      "rollback",
      "archive",
    ];
    requireExactKeys(findings, agentops.gates, gateKeys, `${path}.gates`);
    for (const gate of gateKeys) requireEnum(findings, agentops.gates[gate], ["PASS", "BLOCKED", "NOT_RUN"], `${path}.gates.${gate}`);
    if (agentops.status === "APPROVED" && agentops.gates.humanDecision !== "PASS") {
      push(findings, "agentops-human-decision", path, "APPROVED AgentOps decision requires humanDecision=PASS.");
    }
    if (agentops.gates.contractRehearsal === "PASS") {
      for (const prerequisite of ["sourceShaInventory", "collisionReport", "compatibilityContract"]) {
        if (agentops.gates[prerequisite] !== "PASS") {
          push(findings, "agentops-rehearsal-prerequisite", `${path}.gates.contractRehearsal`, `contractRehearsal=PASS requires ${prerequisite}=PASS.`);
        }
      }
      if (agentops.implementationRef?.ciStatus !== "PASS") {
        push(findings, "agentops-rehearsal-ci", `${path}.gates.contractRehearsal`, "contractRehearsal=PASS requires current passing CI evidence.");
      }
    }
    if (agentops.gates.sourceHistoryImport === "PASS" && target.gates?.import !== "PASS") {
      push(findings, "agentops-import-drift", `${path}.gates.sourceHistoryImport`, "Source-history import cannot pass while the canonical target import gate is not PASS.");
    }
    if (agentops.gates.consumerInventory === "PASS" && target.gates?.consumers !== "PASS") {
      push(findings, "agentops-consumer-drift", `${path}.gates.consumerInventory`, "Consumer inventory cannot pass while the canonical target consumer gate is not PASS.");
    }
    if (agentops.gates.release === "PASS" && (target.gates?.release !== "PASS" || target.release?.status === "NOT_RELEASED")) {
      push(findings, "agentops-release-drift", `${path}.gates.release`, "Release cannot pass without a canonical target release and release gate.");
    }
    if (agentops.gates.redirect === "PASS" && target.gates?.redirect !== "PASS") {
      push(findings, "agentops-redirect-drift", `${path}.gates.redirect`, "Redirect cannot pass while the canonical target redirect gate is not PASS.");
    }
    if (agentops.gates.rollback === "PASS" && target.gates?.rollback !== "PASS") {
      push(findings, "agentops-rollback-drift", `${path}.gates.rollback`, "Rollback cannot pass while the canonical target rollback gate is not PASS.");
    }
    if (agentops.gates.archive === "PASS") {
      for (const prerequisite of ["humanDecision", "sourceHistoryImport", "consumerInventory", "release", "redirect", "rollback"]) {
        if (agentops.gates[prerequisite] !== "PASS") {
          push(findings, "agentops-archive-gate", `${path}.gates.archive`, `archive=PASS requires ${prerequisite}=PASS.`);
        }
      }
      if (target.status !== "VERIFIED") {
        push(findings, "agentops-archive-state", `${path}.gates.archive`, "archive=PASS requires the canonical target to be VERIFIED.");
      }
    }
  }
}

function validateSchemaDocuments(findings, targetsSchema, actionsSchema) {
  for (const [name, document, expectedIdSuffix] of [
    [REQUIRED_FILES.targetsSchema, targetsSchema, "/portfolio/targets.schema.json"],
    [REQUIRED_FILES.actionsSchema, actionsSchema, "/portfolio/actions.schema.json"],
  ]) {
    if (!requireRecord(findings, document, name)) continue;
    if (document.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      push(findings, "schema-draft", `${name}.$schema`, "Expected JSON Schema draft 2020-12.");
    }
    if (typeof document.$id !== "string" || !document.$id.endsWith(expectedIdSuffix)) {
      push(findings, "schema-id", `${name}.$id`, `Schema ID must end with ${expectedIdSuffix}.`);
    }
    if (document.type !== "object" || document.additionalProperties !== false) {
      push(findings, "schema-strictness", name, "Root schema must be an object with additionalProperties=false.");
    }
  }
}

export async function checkPortfolio(rootPath, options = {}) {
  const root = resolve(rootPath);
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const findings = [];

  const [targets, actions, freeze, triage, agentops, targetsSchema, actionsSchema] = await Promise.all([
    readJson(root, REQUIRED_FILES.targets, findings),
    readJson(root, REQUIRED_FILES.actions, findings),
    readJson(root, REQUIRED_FILES.freeze, findings),
    readJson(root, REQUIRED_FILES.triage, findings),
    readJson(root, REQUIRED_FILES.agentops, findings),
    readJson(root, REQUIRED_FILES.targetsSchema, findings),
    readJson(root, REQUIRED_FILES.actionsSchema, findings),
  ]);

  const context = validateTargetsDocument(findings, targets, now);
  validateActionsDocument(findings, actions, context.targetIds);
  validateFreezeDocument(findings, freeze);
  validateTriageDocument(findings, triage);
  validateAgentOpsDocument(findings, agentops, targets, now);
  validateSchemaDocuments(findings, targetsSchema, actionsSchema);

  findings.sort((left, right) => left.path.localeCompare(right.path) || left.rule.localeCompare(right.rule) || left.message.localeCompare(right.message));
  return {
    status: findings.length === 0 ? "PASS" : "FAIL",
    findingCount: findings.length,
    checkedAt: now.toISOString(),
    counts: {
      targets: asArray(targets?.targets).length,
      sourceRepositories: context.sourceToTarget.size,
      registeredPublicRepositories: context.registered.size,
      actions: asArray(actions?.actions).length,
    },
    findings,
  };
}

function parseArguments(argv) {
  const args = { root: "." };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") {
      args.root = argv[index + 1] ?? ".";
      index += 1;
    } else if (value === "--help" || value === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write("Usage: node scripts/check-portfolio.mjs [--root PATH]\n");
    return;
  }
  const report = await checkPortfolio(args.root);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsScript) await main();

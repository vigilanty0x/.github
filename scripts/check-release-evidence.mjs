#!/usr/bin/env node

import fs from "node:fs";

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function validateReleaseEvidence(candidate, policy) {
  const errors = [];
  if (policy?.schemaVersion !== 1 || policy?.status !== "PREPARED" || policy?.scope !== "PUBLIC_ONLY") errors.push("invalid policy envelope");
  if (candidate?.schemaVersion !== 1) errors.push("candidate schemaVersion must be 1");
  if (candidate?.fixture !== true) errors.push("governance fixture must remain explicitly synthetic");
  if (!SHA40.test(candidate?.commit ?? "")) errors.push("candidate commit must be an exact 40-character SHA");
  if (typeof candidate?.tag !== "string" || !candidate.tag.startsWith("v")) errors.push("candidate tag is missing");

  if (candidate?.environment?.protected !== true || !candidate?.environment?.name) errors.push("protected release environment is required");
  if (!Array.isArray(candidate?.artifacts) || candidate.artifacts.length === 0) {
    errors.push("at least one release artifact is required");
  } else {
    for (const artifact of candidate.artifacts) {
      if (!artifact?.path || !SHA256.test(artifact?.sha256 ?? "")) errors.push("every release artifact requires a SHA-256 digest");
    }
  }

  if (!candidate?.sbom?.path || !SHA256.test(candidate?.sbom?.sha256 ?? "")) errors.push("SBOM path and SHA-256 are required");
  if (!candidate?.provenance?.path || !SHA256.test(candidate?.provenance?.sha256 ?? "")) errors.push("provenance path and SHA-256 are required");
  if (candidate?.provenance?.subjectCommit !== candidate?.commit) errors.push("provenance subject must equal candidate commit");

  if (policy?.publishing?.mode !== "OIDC" || policy?.publishing?.longLivedTokenAllowed !== false || policy?.publishing?.protectedEnvironmentRequired !== true) {
    errors.push("governance trusted-publishing policy is invalid");
  }
  if (candidate?.publishing?.mode !== "OIDC") errors.push("trusted publishing must use OIDC");
  if (candidate?.publishing?.longLivedTokenUsed !== false) errors.push("long-lived publishing token must not be used");
  if (candidate?.publishing?.environmentProtected !== true) errors.push("publishing environment must be protected");

  const post = candidate?.postPublication;
  if (post?.status !== "VERIFIED") errors.push("post-publication status must be VERIFIED");
  if (post?.checkedCommit !== candidate?.commit) errors.push("post-publication verification must bind the exact candidate commit");
  if (post?.artifactDigestsMatch !== true) errors.push("post-publication artifact digests must match");
  if (post?.installSmokePassed !== true) errors.push("post-publication install smoke must pass");

  return errors;
}

export function loadAndValidate(candidatePath, policyPath = "portfolio/release-evidence-policy.json") {
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  return validateReleaseEvidence(candidate, policy);
}

if (process.argv[1]?.endsWith("check-release-evidence.mjs")) {
  const candidatePath = process.argv[2];
  if (!candidatePath) {
    console.error("usage: node scripts/check-release-evidence.mjs <candidate.json>");
    process.exitCode = 64;
  } else {
    const errors = loadAndValidate(candidatePath);
    if (errors.length) {
      for (const error of errors) console.error(`BLOCKED: ${error}`);
      process.exitCode = 2;
    } else {
      console.log("PASS: release evidence candidate satisfies the governance policy");
    }
  }
}

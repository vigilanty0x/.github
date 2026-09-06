import assert from "node:assert/strict";
import test from "node:test";

import { buildSnapshot, classifyPullRequest, deriveRegistry, evaluateStopTheLine, renderMarkdown } from "../scripts/live-portfolio.mjs";
import { FIXED_NOW, PROJECT_ROOT } from "./helpers.mjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function policy() {
  const [registry, freeze, triage] = await Promise.all([
    readFile(join(PROJECT_ROOT, "portfolio/targets.json"), "utf8").then(JSON.parse),
    readFile(join(PROJECT_ROOT, "portfolio/freeze.json"), "utf8").then(JSON.parse),
    readFile(join(PROJECT_ROOT, "portfolio/triage-policy.json"), "utf8").then(JSON.parse),
  ]);
  return { registry, freeze, triage };
}

function completeLiveRepositories(registry) {
  const derived = deriveRegistry(registry);
  return [...derived.registered].map((name) => {
    const readback = derived.archiveReadbacks.get(name);
    return {
      name,
      fullName: `vigilanty0x/${name}`,
      archived: derived.sourceStates.get(name) === "ARCHIVED",
      private: false,
      headSha: readback?.headSha ?? null,
      homepage: readback?.homepage ?? null,
    };
  });
}

test("triage precedence keeps security ahead of consolidation and release", async () => {
  const { registry, triage } = await policy();
  const derived = deriveRegistry(registry);
  const context = { triage, ...derived };
  assert.equal(classifyPullRequest({ repository: "proofgate", title: "security consolidation release fix" }, context), "SECURITY");
  assert.equal(classifyPullRequest({ repository: "proofgate", title: "consolidation rehearsal" }, context), "CONSOLIDATION");
  assert.equal(classifyPullRequest({ repository: "proofgate", title: "prepare release changelog" }, context), "RELEASE");
  assert.equal(classifyPullRequest({ repository: "proofgate", title: "dependabot bump dependency" }, context), "DEPENDABOT");
});

test("source-repository work becomes a superseded candidate, never an automatic closure", async () => {
  const { registry, triage } = await policy();
  const derived = deriveRegistry(registry);
  const context = { triage, ...derived };
  assert.equal(classifyPullRequest({ repository: "safe-merge-gate", title: "Refactor tests" }, context), "SUPERSEDED_CANDIDATE");
  assert.equal(classifyPullRequest({ repository: "shipcheck", title: "Refactor tests" }, context), "REVIEW");
  assert.equal(triage.autoClose, false);
  assert.equal(triage.supersession.requiresHumanClosure, true);
});

test("stop-the-line detects repository, backlog, review-capacity, SLA, CI, and conflict drift", async () => {
  const { freeze } = await policy();
  const reasons = evaluateStopTheLine({
    registryExpired: false,
    publicRepositoryCount: 111,
    expectedPublicRepositoryCount: 112,
    missingRegisteredRepositories: ["one"],
    unregisteredPublicRepositories: ["two"],
    openPullRequestCount: 75,
    activeConsolidationTargetCount: 3,
    staleDraftCount: 1,
    overSlaCount: 2,
    failingCiCount: 1,
    mergeConflictCount: 1,
    unexpectedArchivedRepositoryCount: 1,
    expectedArchiveMissingCount: 1,
    archiveReadbackDriftCount: 1,
  }, freeze, []);
  assert.deepEqual(new Set(reasons.map((reason) => reason.code)), new Set([
    "PUBLIC_REPOSITORY_COUNT_DRIFT",
    "REGISTERED_REPOSITORY_MISSING",
    "UNREGISTERED_PUBLIC_REPOSITORY",
    "OPEN_PR_LIMIT",
    "CONSOLIDATION_CAPACITY",
    "STALE_DRAFT",
    "PR_SLA",
    "CI_FAILURE",
    "MERGE_CONFLICT",
    "UNEXPECTED_ARCHIVE",
    "EXPECTED_ARCHIVE_MISSING",
    "ARCHIVE_READBACK_DRIFT",
  ]));
});

test("a complete synthetic live set passes without mutation", async () => {
  const { registry, freeze, triage } = await policy();
  const snapshot = buildSnapshot({
    registry,
    freeze,
    triage,
    now: FIXED_NOW,
    errors: [],
    publicRepositories: completeLiveRepositories(registry),
    pullRequests: [
      {
        repository: "vigilanty0x/proofgate",
        number: 1,
        title: "Document proof semantics",
        body: "",
        url: "https://github.com/vigilanty0x/proofgate/pull/1",
        author: "reviewer",
        createdAt: "2026-09-06T14:30:00Z",
        updatedAt: "2026-09-06T14:50:00Z",
        draft: false,
        mergeable: true,
        mergeableState: "clean",
        checkRuns: [{ status: "completed", conclusion: "success" }],
      },
    ],
  });
  assert.equal(snapshot.status, "PASS", JSON.stringify(snapshot.stopReasons, null, 2));
  assert.equal(snapshot.automaticMutation, false);
  assert.equal(snapshot.summary.publicRepositoryCount, 112);
  assert.equal(snapshot.pullRequests[0].ciStatus, "SUCCESS");
  assert.equal(snapshot.pullRequests[0].category, "REVIEW");
});

test("three consolidation targets exceed the independent review cap", async () => {
  const { registry, freeze, triage } = await policy();
  const pullRequests = ["proofgate", "repo-doctor", "promptops"].map((repository, index) => ({
    repository: `vigilanty0x/${repository}`,
    number: index + 1,
    title: "Consolidation rehearsal",
    body: "",
    createdAt: "2026-08-18T08:00:00Z",
    updatedAt: "2026-08-18T11:00:00Z",
    draft: true,
    mergeable: true,
    mergeableState: "clean",
    checkRuns: [{ status: "completed", conclusion: "success" }],
  }));
  const snapshot = buildSnapshot({
    registry,
    freeze,
    triage,
    now: FIXED_NOW,
    errors: [],
    publicRepositories: completeLiveRepositories(registry),
    pullRequests,
  });
  assert.equal(snapshot.status, "STOPPED");
  assert.equal(snapshot.summary.activeConsolidationTargetCount, 3);
  assert.equal(snapshot.stopReasons.some((reason) => reason.code === "CONSOLIDATION_CAPACITY"), true);
});

test("Markdown report states read-only evidence and distinct delivery states", async () => {
  const { registry, freeze, triage } = await policy();
  const snapshot = buildSnapshot({
    registry,
    freeze,
    triage,
    now: FIXED_NOW,
    errors: [],
    publicRepositories: completeLiveRepositories(registry),
    pullRequests: [],
  });
  const markdown = renderMarkdown(snapshot);
  assert.match(markdown, /read-only collection/i);
  assert.match(markdown, /PREPARED/);
  assert.match(markdown, /VERIFIED/);
  assert.match(markdown, /performs no mutation/i);
});

test("live archive reconciliation is bidirectional and checks bounded readback", async () => {
  const { registry, freeze, triage } = await policy();
  const repositories = completeLiveRepositories(registry);
  repositories.find((repository) => repository.name === "answer-diff").archived = false;
  repositories.find((repository) => repository.name === "benchmark-run-recorder").headSha = "f".repeat(40);
  repositories.find((repository) => repository.name === "promptbench").archived = true;
  const snapshot = buildSnapshot({ registry, freeze, triage, now: FIXED_NOW, errors: [], publicRepositories: repositories, pullRequests: [] });
  assert.equal(snapshot.status, "STOPPED");
  assert.deepEqual(new Set(snapshot.stopReasons.map((reason) => reason.code)), new Set([
    "UNEXPECTED_ARCHIVE",
    "EXPECTED_ARCHIVE_MISSING",
    "ARCHIVE_READBACK_DRIFT",
  ]));
  assert.deepEqual(snapshot.summary.expectedArchiveMissingRepositories, ["answer-diff"]);
  assert.deepEqual(snapshot.summary.unexpectedArchivedRepositories, ["promptbench"]);
  assert.deepEqual(snapshot.summary.archiveReadbackDrift, [{ repository: "benchmark-run-recorder", fields: ["headSha"] }]);
});

test("CLI collects paginated read-only GitHub evidence through a bounded HTTP mock", async () => {
  const { createServer } = await import("node:http");
  const { mkdtemp, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { spawn } = await import("node:child_process");
  const { join } = await import("node:path");

  const { registry } = await policy();
  const derived = deriveRegistry(registry);
  const names = [...derived.registered].sort();
  let baseUrl = "";
  const server = createServer((request, response) => {
    const url = new URL(request.url, baseUrl);
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/users/vigilanty0x/repos") {
      const page = Number(url.searchParams.get("page") || "1");
      const slice = names.slice((page - 1) * 100, page * 100).map((name) => {
        const readback = derived.archiveReadbacks.get(name);
        return {
          name,
          full_name: `vigilanty0x/${name}`,
          private: false,
          archived: derived.sourceStates.get(name) === "ARCHIVED",
          fork: false,
          default_branch: "main",
          homepage: readback?.homepage ?? null,
          updated_at: "2026-09-06T14:51:35Z",
          html_url: `https://github.com/vigilanty0x/${name}`,
        };
      });
      response.end(JSON.stringify(slice));
      return;
    }
    const archivedCommitMatch = /^\/repos\/vigilanty0x\/([^/]+)\/commits\/main$/.exec(url.pathname);
    if (archivedCommitMatch && derived.archiveReadbacks.has(archivedCommitMatch[1])) {
      response.end(JSON.stringify({ sha: derived.archiveReadbacks.get(archivedCommitMatch[1]).headSha }));
      return;
    }
    if (url.pathname === "/search/issues") {
      response.end(JSON.stringify({
        total_count: 1,
        items: [{
          number: 1,
          title: "Document proof semantics",
          body: "",
          html_url: "https://github.com/vigilanty0x/proofgate/pull/1",
          repository_url: `${baseUrl}/repos/vigilanty0x/proofgate`,
          pull_request: { url: `${baseUrl}/repos/vigilanty0x/proofgate/pulls/1` },
          user: { login: "reviewer" },
          labels: [],
          created_at: "2026-08-18T08:00:00Z",
          updated_at: "2026-08-18T11:00:00Z",
          draft: false,
        }],
      }));
      return;
    }
    if (url.pathname === "/repos/vigilanty0x/proofgate/pulls/1") {
      response.end(JSON.stringify({
        number: 1,
        title: "Document proof semantics",
        body: "",
        html_url: "https://github.com/vigilanty0x/proofgate/pull/1",
        user: { login: "reviewer" },
        labels: [],
        created_at: "2026-08-18T08:00:00Z",
        updated_at: "2026-08-18T11:00:00Z",
        draft: false,
        head: { sha: "a".repeat(40) },
        base: { ref: "main" },
        additions: 10,
        deletions: 2,
        changed_files: 2,
        mergeable: true,
        mergeable_state: "clean",
      }));
      return;
    }
    if (url.pathname === `/repos/vigilanty0x/proofgate/commits/${"a".repeat(40)}/check-runs`) {
      response.end(JSON.stringify({ check_runs: [{ name: "policy", status: "completed", conclusion: "success", html_url: "https://example.invalid/check" }] }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: `Unhandled ${url.pathname}` }));
  });

  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  const output = await mkdtemp(join(tmpdir(), "portfolio-live-cli-"));

  try {
    const result = await new Promise((resolveProcess, rejectProcess) => {
      const child = spawn(process.execPath, [
        join(PROJECT_ROOT, "scripts/live-portfolio.mjs"),
        "--root", PROJECT_ROOT,
        "--api-url", baseUrl,
        "--output-json", join(output, "snapshot.json"),
        "--output-markdown", join(output, "snapshot.md"),
      ], {
        env: { ...process.env, GITHUB_TOKEN: "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", rejectProcess);
      child.on("close", (code) => resolveProcess({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const snapshot = JSON.parse(await readFile(join(output, "snapshot.json"), "utf8"));
    const markdown = await readFile(join(output, "snapshot.md"), "utf8");
    assert.equal(snapshot.mode, "READ_ONLY");
    assert.equal(snapshot.automaticMutation, false);
    assert.deepEqual(snapshot.errors, []);
    assert.equal(snapshot.summary.publicRepositoryCount, 112);
    assert.equal(snapshot.pullRequests[0].ciStatus, "SUCCESS");
    assert.match(markdown, /proofgate#1/);
  } finally {
    await new Promise((resolveServer, rejectServer) => server.close((error) => error ? rejectServer(error) : resolveServer()));
  }
});

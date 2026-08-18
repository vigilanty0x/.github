#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_API_URL = "https://api.github.com";
const FAILURE_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"]);
const SUCCESS_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseDate(value) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hoursBetween(start, end) {
  const startDate = parseDate(start);
  const endDate = end instanceof Date ? end : parseDate(end);
  if (!startDate || !endDate) return null;
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 3_600_000);
}

function repositoryFromApiUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const reposIndex = parts.lastIndexOf("repos");
    if (reposIndex >= 0 && parts.length > reposIndex + 2) return `${parts[reposIndex + 1]}/${parts[reposIndex + 2]}`;
    if (parts.length >= 2) return `${parts.at(-2)}/${parts.at(-1)}`;
  } catch {
    return null;
  }
  return null;
}

function repositoryName(fullName) {
  if (typeof fullName !== "string") return null;
  return fullName.includes("/") ? fullName.split("/").at(-1) : fullName;
}

export function deriveRegistry(registry) {
  const targetById = new Map();
  const sourceToTarget = new Map();
  const canonicalToTarget = new Map();
  const registered = new Set();
  const sourceStates = new Map();

  for (const target of asArray(registry?.targets)) {
    if (!isRecord(target) || typeof target.id !== "string") continue;
    const descriptor = {
      id: target.id,
      canonicalRepository: target.canonicalRepository,
      status: target.status,
      releaseStatus: target.release?.status,
      gates: target.gates ?? {},
    };
    targetById.set(target.id, descriptor);
    if (typeof target.canonicalRepository === "string") {
      canonicalToTarget.set(target.canonicalRepository, descriptor);
      registered.add(target.canonicalRepository);
    }
    for (const companion of asArray(target.companionRepositories)) {
      if (typeof companion === "string") registered.add(companion);
    }
    for (const source of asArray(target.sources)) {
      if (!isRecord(source) || typeof source.repository !== "string") continue;
      sourceToTarget.set(source.repository, descriptor);
      sourceStates.set(source.repository, source.state);
      registered.add(source.repository);
    }
  }
  for (const standalone of asArray(registry?.standaloneRepositories)) {
    if (typeof standalone?.repository === "string") registered.add(standalone.repository);
  }

  return { targetById, sourceToTarget, canonicalToTarget, registered, sourceStates };
}

export function classifyPullRequest(pullRequest, context) {
  const triage = context?.triage ?? {};
  const sourceToTarget = context?.sourceToTarget ?? new Map();
  const title = typeof pullRequest?.title === "string" ? pullRequest.title : "";
  const body = typeof pullRequest?.body === "string" ? pullRequest.body : "";
  const author = typeof pullRequest?.author === "string" ? pullRequest.author : "";
  const labels = asArray(pullRequest?.labels).join(" ");
  const text = `${title}\n${body}\n${author}\n${labels}`.toLowerCase();

  const categories = [...asArray(triage.categories)].sort((left, right) => (left.precedence ?? 9999) - (right.precedence ?? 9999));
  for (const category of categories) {
    if (["SUPERSEDED_CANDIDATE", "REVIEW"].includes(category?.id)) continue;
    if (asArray(category?.patterns).some((pattern) => typeof pattern === "string" && pattern && text.includes(pattern.toLowerCase()))) {
      return category.id;
    }
  }

  const repo = repositoryName(pullRequest?.repository);
  const target = sourceToTarget.get(repo);
  if (target && target.canonicalRepository !== repo) return "SUPERSEDED_CANDIDATE";
  return "REVIEW";
}

function categoryById(triage) {
  return new Map(asArray(triage?.categories).map((category) => [category.id, category]));
}

function deriveCiStatus(checkRuns) {
  const runs = asArray(checkRuns);
  if (runs.length === 0) return "NONE";
  if (runs.some((run) => run.status !== "completed")) return "PENDING";
  const conclusions = runs.map((run) => run.conclusion).filter(Boolean);
  if (conclusions.some((conclusion) => FAILURE_CONCLUSIONS.has(conclusion))) return "FAILURE";
  if (conclusions.length > 0 && conclusions.every((conclusion) => SUCCESS_CONCLUSIONS.has(conclusion))) return "SUCCESS";
  return "UNKNOWN";
}

function normalizePullRequest(pullRequest, context, now) {
  const repo = repositoryName(pullRequest.repository);
  const category = classifyPullRequest({ ...pullRequest, repository: repo }, context);
  const categoryPolicy = categoryById(context.triage).get(category) ?? { slaHours: 168, action: "NORMAL_REVIEW", precedence: 9999 };
  const target = context.sourceToTarget.get(repo) ?? context.canonicalToTarget.get(repo) ?? null;
  const createdAgeHours = hoursBetween(pullRequest.createdAt, now);
  const updatedAgeHours = hoursBetween(pullRequest.updatedAt, now);
  const draftAgeDays = pullRequest.draft === true && createdAgeHours !== null ? createdAgeHours / 24 : null;
  const ciStatus = pullRequest.ciStatus ?? deriveCiStatus(pullRequest.checkRuns);
  const mergeConflict = pullRequest.mergeable === false || pullRequest.mergeableState === "dirty";
  const overSla = updatedAgeHours !== null && updatedAgeHours > categoryPolicy.slaHours;
  const staleDraft = draftAgeDays !== null && draftAgeDays > context.freeze.limits.maxDraftAgeDays;

  return {
    repository: repo,
    number: pullRequest.number,
    title: pullRequest.title ?? "",
    url: pullRequest.url ?? null,
    author: pullRequest.author ?? null,
    createdAt: pullRequest.createdAt ?? null,
    updatedAt: pullRequest.updatedAt ?? null,
    draft: pullRequest.draft ?? null,
    headSha: pullRequest.headSha ?? null,
    baseRef: pullRequest.baseRef ?? null,
    additions: pullRequest.additions ?? null,
    deletions: pullRequest.deletions ?? null,
    changedFiles: pullRequest.changedFiles ?? null,
    mergeable: pullRequest.mergeable ?? null,
    mergeableState: pullRequest.mergeableState ?? null,
    mergeConflict,
    ciStatus,
    checkRunCount: asArray(pullRequest.checkRuns).length,
    category,
    categoryPrecedence: categoryPolicy.precedence,
    policyAction: categoryPolicy.action,
    slaHours: categoryPolicy.slaHours,
    ageHours: createdAgeHours === null ? null : round(createdAgeHours),
    hoursSinceUpdate: updatedAgeHours === null ? null : round(updatedAgeHours),
    draftAgeDays: draftAgeDays === null ? null : round(draftAgeDays),
    overSla,
    staleDraft,
    target: target?.id ?? null,
    canonicalRepository: target?.canonicalRepository ?? null,
    sourceState: context.sourceStates.get(repo) ?? null,
  };
}

export function evaluateStopTheLine(summary, freeze, errors = []) {
  const reasons = [];
  if (errors.length > 0) reasons.push({ code: "LIVE_FETCH_ERROR", message: `${errors.length} live API operation(s) failed.` });
  if (summary.registryExpired) reasons.push({ code: "REGISTRY_EXPIRED", message: "The canonical registry evidence TTL has expired." });
  if (summary.publicRepositoryCount !== summary.expectedPublicRepositoryCount) {
    reasons.push({ code: "PUBLIC_REPOSITORY_COUNT_DRIFT", message: `Expected ${summary.expectedPublicRepositoryCount} public repositories; observed ${summary.publicRepositoryCount}.` });
  }
  if (summary.missingRegisteredRepositories.length > 0) {
    reasons.push({ code: "REGISTERED_REPOSITORY_MISSING", message: `${summary.missingRegisteredRepositories.length} registered repositories are absent from the live public set.` });
  }
  if (summary.unregisteredPublicRepositories.length > 0) {
    reasons.push({ code: "UNREGISTERED_PUBLIC_REPOSITORY", message: `${summary.unregisteredPublicRepositories.length} live public repositories are missing from the registry.` });
  }
  if (summary.openPullRequestCount > freeze.limits.maxOpenPullRequests) {
    reasons.push({ code: "OPEN_PR_LIMIT", message: `${summary.openPullRequestCount} open pull requests exceed the limit of ${freeze.limits.maxOpenPullRequests}.` });
  }
  if (summary.activeConsolidationTargetCount > freeze.limits.maxActiveConsolidations) {
    reasons.push({ code: "CONSOLIDATION_CAPACITY", message: `${summary.activeConsolidationTargetCount} consolidation targets exceed the review capacity of ${freeze.limits.maxActiveConsolidations}.` });
  }
  if (summary.staleDraftCount > 0) reasons.push({ code: "STALE_DRAFT", message: `${summary.staleDraftCount} draft pull requests exceed the draft age limit.` });
  if (summary.overSlaCount > 0) reasons.push({ code: "PR_SLA", message: `${summary.overSlaCount} pull requests exceed their category SLA.` });
  if (summary.failingCiCount > 0) reasons.push({ code: "CI_FAILURE", message: `${summary.failingCiCount} pull requests have failing checks.` });
  if (summary.mergeConflictCount > 0) reasons.push({ code: "MERGE_CONFLICT", message: `${summary.mergeConflictCount} pull requests have merge conflicts.` });
  if (summary.unexpectedArchivedRepositoryCount > 0) {
    reasons.push({ code: "UNEXPECTED_ARCHIVE", message: `${summary.unexpectedArchivedRepositoryCount} public repositories are archived without an ARCHIVED registry state.` });
  }
  return reasons;
}

export function buildSnapshot(input) {
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  const registry = input.registry;
  const freeze = input.freeze;
  const triage = input.triage;
  const errors = asArray(input.errors);
  const derived = deriveRegistry(registry);
  const publicRepositories = asArray(input.publicRepositories)
    .filter((repository) => repository?.private !== true)
    .map((repository) => ({
      name: repositoryName(repository.name ?? repository.fullName),
      fullName: repository.fullName ?? repository.full_name ?? null,
      archived: repository.archived === true,
      fork: repository.fork === true,
      defaultBranch: repository.defaultBranch ?? repository.default_branch ?? null,
      updatedAt: repository.updatedAt ?? repository.updated_at ?? null,
      url: repository.url ?? repository.html_url ?? null,
    }))
    .filter((repository) => repository.name)
    .sort((left, right) => left.name.localeCompare(right.name));
  const publicSet = new Set(publicRepositories.map((repository) => repository.name));
  const missingRegisteredRepositories = [...derived.registered].filter((repository) => !publicSet.has(repository)).sort();
  const unregisteredPublicRepositories = [...publicSet].filter((repository) => !derived.registered.has(repository)).sort();

  const context = { triage, freeze, ...derived };
  const pullRequests = asArray(input.pullRequests)
    .filter((pullRequest) => publicSet.has(repositoryName(pullRequest.repository)))
    .map((pullRequest) => normalizePullRequest(pullRequest, context, now))
    .sort((left, right) => left.categoryPrecedence - right.categoryPrecedence || String(left.repository).localeCompare(String(right.repository)) || (left.number ?? 0) - (right.number ?? 0));

  const categoryCounts = {};
  for (const category of asArray(triage.categories)) categoryCounts[category.id] = 0;
  for (const pullRequest of pullRequests) categoryCounts[pullRequest.category] = (categoryCounts[pullRequest.category] ?? 0) + 1;

  const activeConsolidationTargets = [...new Set(
    pullRequests
      .filter((pullRequest) => pullRequest.category === "CONSOLIDATION")
      .map((pullRequest) => pullRequest.target ?? pullRequest.repository),
  )].sort();
  const registryExpiry = parseDate(registry.expiresAt);
  const unexpectedArchivedRepositories = publicRepositories
    .filter((repository) => repository.archived && derived.sourceStates.get(repository.name) !== "ARCHIVED")
    .map((repository) => repository.name);

  const summary = {
    owner: registry.owner,
    observedAt: now.toISOString(),
    registryObservedAt: registry.observedAt,
    registryExpiresAt: registry.expiresAt,
    registryExpired: !registryExpiry || registryExpiry <= now,
    expectedPublicRepositoryCount: registry.expectedPublicRepositoryCount,
    publicRepositoryCount: publicRepositories.length,
    missingRegisteredRepositories,
    unregisteredPublicRepositories,
    archivedPublicRepositoryCount: publicRepositories.filter((repository) => repository.archived).length,
    unexpectedArchivedRepositoryCount: unexpectedArchivedRepositories.length,
    unexpectedArchivedRepositories,
    openPullRequestCount: pullRequests.length,
    draftPullRequestCount: pullRequests.filter((pullRequest) => pullRequest.draft === true).length,
    unknownDraftStateCount: pullRequests.filter((pullRequest) => pullRequest.draft === null).length,
    staleDraftCount: pullRequests.filter((pullRequest) => pullRequest.staleDraft).length,
    overSlaCount: pullRequests.filter((pullRequest) => pullRequest.overSla).length,
    failingCiCount: pullRequests.filter((pullRequest) => pullRequest.ciStatus === "FAILURE").length,
    pendingCiCount: pullRequests.filter((pullRequest) => pullRequest.ciStatus === "PENDING").length,
    noCiCount: pullRequests.filter((pullRequest) => pullRequest.ciStatus === "NONE").length,
    mergeConflictCount: pullRequests.filter((pullRequest) => pullRequest.mergeConflict).length,
    activeConsolidationTargetCount: activeConsolidationTargets.length,
    activeConsolidationTargets,
    categoryCounts,
  };
  const stopReasons = evaluateStopTheLine(summary, freeze, errors);

  return {
    schemaVersion: 1,
    mode: "READ_ONLY",
    automaticMutation: false,
    status: stopReasons.length === 0 ? "PASS" : "STOPPED",
    generatedAt: now.toISOString(),
    registry: {
      owner: registry.owner,
      expectedTargetCount: registry.expectedTargetCount,
      expectedSourceRepositoryCount: registry.expectedSourceRepositoryCount,
      expectedPublicRepositoryCount: registry.expectedPublicRepositoryCount,
      observedAt: registry.observedAt,
      expiresAt: registry.expiresAt,
    },
    policy: {
      freezeActive: freeze.active,
      maxOpenPullRequests: freeze.limits.maxOpenPullRequests,
      maxActiveConsolidations: freeze.limits.maxActiveConsolidations,
      maxDraftAgeDays: freeze.limits.maxDraftAgeDays,
      autoClose: triage.autoClose,
      autoMerge: triage.autoMerge,
    },
    summary,
    stopReasons,
    errors,
    repositories: publicRepositories,
    pullRequests,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .trim();
}

function displayNumber(value) {
  return value === null || value === undefined ? "unknown" : String(value);
}

export function renderMarkdown(snapshot) {
  const statusIcon = snapshot.status === "PASS" ? "✅" : "⛔";
  const lines = [
    `# Public portfolio live evidence — ${snapshot.generatedAt.slice(0, 10)}`,
    "",
    `**${statusIcon} ${snapshot.status}** — read-only collection; no merge, close, archive, release, or repository mutation performed.`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Public repositories | ${snapshot.summary.publicRepositoryCount} / ${snapshot.summary.expectedPublicRepositoryCount} |`,
    `| Open pull requests | ${snapshot.summary.openPullRequestCount} / ${snapshot.policy.maxOpenPullRequests} |`,
    `| Draft pull requests | ${snapshot.summary.draftPullRequestCount} |`,
    `| Stale drafts | ${snapshot.summary.staleDraftCount} |`,
    `| PRs over SLA | ${snapshot.summary.overSlaCount} |`,
    `| Failing CI | ${snapshot.summary.failingCiCount} |`,
    `| Merge conflicts | ${snapshot.summary.mergeConflictCount} |`,
    `| Active consolidation targets | ${snapshot.summary.activeConsolidationTargetCount} / ${snapshot.policy.maxActiveConsolidations} |`,
    "",
  ];

  if (snapshot.stopReasons.length > 0) {
    lines.push("## Stop-the-line reasons", "");
    for (const reason of snapshot.stopReasons) lines.push(`- **${escapeMarkdown(reason.code)}:** ${escapeMarkdown(reason.message)}`);
    lines.push("");
  }

  if (snapshot.summary.missingRegisteredRepositories.length > 0 || snapshot.summary.unregisteredPublicRepositories.length > 0) {
    lines.push("## Registry drift", "");
    if (snapshot.summary.missingRegisteredRepositories.length > 0) lines.push(`- Missing live: ${snapshot.summary.missingRegisteredRepositories.map((value) => `\`${escapeMarkdown(value)}\``).join(", ")}`);
    if (snapshot.summary.unregisteredPublicRepositories.length > 0) lines.push(`- Unregistered live: ${snapshot.summary.unregisteredPublicRepositories.map((value) => `\`${escapeMarkdown(value)}\``).join(", ")}`);
    lines.push("");
  }

  lines.push("## Pull-request triage", "", "| Category | PR | Draft | Updated h | CI | Merge | Target | Next action | Title |", "| --- | --- | --- | ---: | --- | --- | --- | --- | --- |");
  for (const pullRequest of snapshot.pullRequests) {
    const prLabel = pullRequest.url
      ? `[${escapeMarkdown(pullRequest.repository)}#${displayNumber(pullRequest.number)}](${pullRequest.url})`
      : `${escapeMarkdown(pullRequest.repository)}#${displayNumber(pullRequest.number)}`;
    lines.push(`| ${escapeMarkdown(pullRequest.category)} | ${prLabel} | ${pullRequest.draft === true ? "yes" : pullRequest.draft === false ? "no" : "unknown"} | ${displayNumber(pullRequest.hoursSinceUpdate)} | ${escapeMarkdown(pullRequest.ciStatus)} | ${pullRequest.mergeConflict ? "CONFLICT" : escapeMarkdown(pullRequest.mergeableState ?? "unknown")} | ${escapeMarkdown(pullRequest.target ?? "unmapped")} | ${escapeMarkdown(pullRequest.policyAction)} | ${escapeMarkdown(pullRequest.title)} |`);
  }
  if (snapshot.pullRequests.length === 0) lines.push("| — | — | — | — | — | — | — | — | No public pull requests observed. |");

  lines.push("", "## Evidence contract", "", "- `PREPARED`, `MERGED`, `TAGGED`, `RELEASED`, and `VERIFIED` remain separate states.", "- A draft or merged preparation is not a release.", "- Strict mode exits non-zero when any stop-the-line condition is present.", "- This report is evidence only and performs no mutation.", "");
  return `${lines.join("\n")}\n`;
}

async function requestJson(url, token, options = {}) {
  const headers = {
    Accept: options.accept ?? "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "vigilanty0x-public-portfolio-evidence",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
  const text = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.message ? `: ${parsed.message}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`GitHub API ${response.status} for ${new URL(url).pathname}${detail}`);
  }
  return text ? JSON.parse(text) : null;
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, values.length || 1)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchPublicRepositories(owner, apiUrl, token) {
  const repositories = [];
  for (let page = 1; ; page += 1) {
    const url = `${apiUrl}/users/${encodeURIComponent(owner)}/repos?type=owner&sort=full_name&direction=asc&per_page=100&page=${page}`;
    const pageItems = await requestJson(url, token);
    if (!Array.isArray(pageItems)) throw new Error("GitHub repository response was not an array.");
    for (const repository of pageItems) {
      if (repository.private === true) continue;
      repositories.push({
        name: repository.name,
        fullName: repository.full_name,
        private: repository.private,
        archived: repository.archived,
        fork: repository.fork,
        defaultBranch: repository.default_branch,
        updatedAt: repository.updated_at,
        url: repository.html_url,
      });
    }
    if (pageItems.length < 100) break;
    if (page > 100) throw new Error("Repository pagination safety limit exceeded.");
  }
  return repositories;
}

async function fetchOpenPullRequestSearch(owner, apiUrl, token) {
  const query = encodeURIComponent(`user:${owner} is:pr is:open`);
  const items = [];
  for (let page = 1; ; page += 1) {
    const url = `${apiUrl}/search/issues?q=${query}&sort=updated&order=desc&per_page=100&page=${page}`;
    const response = await requestJson(url, token);
    if (!isRecord(response) || !Array.isArray(response.items)) throw new Error("GitHub pull-request search response was invalid.");
    items.push(...response.items);
    if (items.length >= response.total_count || response.items.length < 100) break;
    if (page > 10) throw new Error("Pull-request pagination safety limit exceeded.");
  }
  return items;
}

async function enrichPullRequest(item, apiUrl, token) {
  const fullName = repositoryFromApiUrl(item.repository_url);
  const pullUrl = item.pull_request?.url;
  if (!fullName || !pullUrl) throw new Error("Search result lacks repository or pull-request URL.");
  const detail = await requestJson(pullUrl, token);
  let checkRuns = [];
  if (detail?.head?.sha) {
    const checkUrl = `${apiUrl}/repos/${fullName}/commits/${detail.head.sha}/check-runs?per_page=100`;
    const checks = await requestJson(checkUrl, token, { accept: "application/vnd.github+json" });
    checkRuns = asArray(checks?.check_runs).map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
    }));
  }
  return {
    repository: fullName,
    number: detail.number ?? item.number,
    title: detail.title ?? item.title,
    body: detail.body ?? item.body,
    url: detail.html_url ?? item.html_url,
    author: detail.user?.login ?? item.user?.login ?? null,
    labels: asArray(detail.labels).map((label) => label.name).filter(Boolean),
    createdAt: detail.created_at ?? item.created_at,
    updatedAt: detail.updated_at ?? item.updated_at,
    draft: typeof detail.draft === "boolean" ? detail.draft : typeof item.draft === "boolean" ? item.draft : null,
    headSha: detail.head?.sha ?? null,
    baseRef: detail.base?.ref ?? null,
    additions: detail.additions ?? null,
    deletions: detail.deletions ?? null,
    changedFiles: detail.changed_files ?? null,
    mergeable: detail.mergeable ?? null,
    mergeableState: detail.mergeable_state ?? null,
    checkRuns,
    ciStatus: deriveCiStatus(checkRuns),
  };
}

async function collectLiveData({ owner, apiUrl, token, enrich }) {
  const errors = [];
  const publicRepositories = await fetchPublicRepositories(owner, apiUrl, token);
  const publicFullNames = new Set(publicRepositories.map((repository) => repository.fullName));
  const searchItems = await fetchOpenPullRequestSearch(owner, apiUrl, token);
  const publicItems = searchItems.filter((item) => publicFullNames.has(repositoryFromApiUrl(item.repository_url)));

  let pullRequests;
  if (enrich) {
    const enriched = await mapLimit(publicItems, 8, async (item) => {
      try {
        return await enrichPullRequest(item, apiUrl, token);
      } catch (error) {
        const fullName = repositoryFromApiUrl(item.repository_url);
        errors.push({
          operation: "ENRICH_PULL_REQUEST",
          repository: fullName ? repositoryName(fullName) : null,
          number: item.number ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
        return {
          repository: fullName,
          number: item.number,
          title: item.title,
          body: item.body,
          url: item.html_url,
          author: item.user?.login ?? null,
          labels: asArray(item.labels).map((label) => label.name).filter(Boolean),
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          draft: typeof item.draft === "boolean" ? item.draft : null,
          mergeable: null,
          mergeableState: null,
          checkRuns: [],
          ciStatus: "UNKNOWN",
        };
      }
    });
    pullRequests = enriched;
  } else {
    pullRequests = publicItems.map((item) => ({
      repository: repositoryFromApiUrl(item.repository_url),
      number: item.number,
      title: item.title,
      body: item.body,
      url: item.html_url,
      author: item.user?.login ?? null,
      labels: asArray(item.labels).map((label) => label.name).filter(Boolean),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      draft: typeof item.draft === "boolean" ? item.draft : null,
      mergeable: null,
      mergeableState: null,
      checkRuns: [],
      ciStatus: "UNKNOWN",
    }));
  }
  return { publicRepositories, pullRequests, errors };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeOutput(path, content) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, content, "utf8");
}

function parseArguments(argv) {
  const result = {
    root: ".",
    strict: false,
    outputJson: null,
    outputMarkdown: null,
    owner: null,
    apiUrl: process.env.GITHUB_API_URL || DEFAULT_API_URL,
    enrich: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") {
      result.root = argv[++index] ?? ".";
    } else if (value === "--strict") {
      result.strict = true;
    } else if (value === "--output-json") {
      result.outputJson = argv[++index] ?? null;
    } else if (value === "--output-markdown") {
      result.outputMarkdown = argv[++index] ?? null;
    } else if (value === "--owner") {
      result.owner = argv[++index] ?? null;
    } else if (value === "--api-url") {
      result.apiUrl = argv[++index] ?? DEFAULT_API_URL;
    } else if (value === "--no-enrich") {
      result.enrich = false;
    } else if (value === "--help" || value === "-h") {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return result;
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
    process.stdout.write("Usage: node scripts/live-portfolio.mjs [--root PATH] [--strict] [--output-json FILE] [--output-markdown FILE] [--owner LOGIN] [--api-url URL] [--no-enrich]\n");
    return;
  }

  const root = resolve(args.root);
  let registry;
  let freeze;
  let triage;
  try {
    [registry, freeze, triage] = await Promise.all([
      readJson(join(root, "portfolio/targets.json")),
      readJson(join(root, "portfolio/freeze.json")),
      readJson(join(root, "portfolio/triage-policy.json")),
    ]);
  } catch (error) {
    process.stderr.write(`Unable to load portfolio policy: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  const owner = args.owner ?? registry.owner;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  let live;
  try {
    live = await collectLiveData({ owner, apiUrl: args.apiUrl.replace(/\/$/, ""), token, enrich: args.enrich });
  } catch (error) {
    live = {
      publicRepositories: [],
      pullRequests: [],
      errors: [{ operation: "COLLECT_LIVE_DATA", repository: null, number: null, message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const snapshot = buildSnapshot({ registry, freeze, triage, ...live, now: new Date() });
  const markdown = renderMarkdown(snapshot);
  if (args.outputJson) await writeOutput(args.outputJson, `${JSON.stringify(snapshot, null, 2)}\n`);
  if (args.outputMarkdown) await writeOutput(args.outputMarkdown, markdown);
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  if (args.strict && snapshot.status !== "PASS") process.exitCode = 1;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsScript) await main();

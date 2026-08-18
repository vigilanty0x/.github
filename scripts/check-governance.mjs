#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { checkPortfolio } from "./check-portfolio.mjs";

const FORBIDDEN_TOKEN_DIGESTS = new Set([
  "003cc88d6e2eb5d4e5a02df093ee97f3a638d82599ba2f7770aae5a66c951ade",
]);
const REQUIRED = ["README.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md", "SUPPORT.md", "CODE_OF_CONDUCT.md", ".github/CODEOWNERS"];
const SKIP = new Set([".git", "node_modules", "dist", "coverage", "portfolio-live"]);

const digest = (value) => createHash("sha256").update(value.toUpperCase()).digest("hex");

async function files(root, directory = root) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, path));
    else if (entry.isFile() && (await stat(path)).size <= 2_000_000) result.push(path);
  }
  return result;
}

export async function check(rootPath, options = {}) {
  const root = resolve(rootPath);
  const findings = [];
  for (const required of REQUIRED) {
    try {
      await stat(join(root, required));
    } catch {
      findings.push({ rule: "required-file", path: required });
    }
  }

  for (const path of await files(root)) {
    let content;
    try {
      content = await readFile(path, "utf8");
    } catch {
      continue;
    }
    const file = relative(root, path).replaceAll("\\", "/");
    for (const match of content.matchAll(/[A-Za-z0-9_-]{3,}/g)) {
      if (FORBIDDEN_TOKEN_DIGESTS.has(digest(match[0]))) {
        const line = content.slice(0, match.index).split(/\r?\n/).length;
        findings.push({ rule: "public-boundary", path: file, line });
      }
    }
    if (/^(?:\.github\/workflows\/|workflow-templates\/).*\.ya?ml$/i.test(file)) {
      if (!/^permissions\s*:/m.test(content)) findings.push({ rule: "workflow-permissions", path: file });
      if (/runs-on:\s*ubuntu-latest/i.test(content)) findings.push({ rule: "mutable-runner", path: file });
      for (const [index, line] of content.split(/\r?\n/).entries()) {
        const use = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/.exec(line)?.[1];
        if (!use || use.startsWith("./") || /\$\{\{/.test(use)) continue;
        const reference = use.slice(use.lastIndexOf("@") + 1);
        if (!/^[0-9a-f]{40}$/i.test(reference)) findings.push({ rule: "mutable-action", path: file, line: index + 1 });
      }
    }
  }

  const portfolio = await checkPortfolio(root, { now: options.now });
  findings.push(...portfolio.findings.map((entry) => ({ ...entry, source: "portfolio" })));
  findings.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
  return {
    status: findings.length ? "FAIL" : "PASS",
    findingCount: findings.length,
    findings,
    valuesIncluded: false,
    portfolio: {
      status: portfolio.status,
      counts: portfolio.counts,
    },
  };
}

const rootIndex = process.argv.indexOf("--root");
if (process.argv[1]?.endsWith("check-governance.mjs")) {
  const report = await check(rootIndex >= 0 ? process.argv[rootIndex + 1] : ".");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_FILE_BYTES = 2_000_000;
const MAX_FILES = 250_000;
const MAX_REFERENCES = 50_000;
const DEFAULT_TTL_DAYS = 30;
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".venv",
  "venv",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".coverage",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "__pycache__",
  "vendor",
  "target",
  "portfolio-live",
  "consumer-live",
]);
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".lock",
  ".md",
  ".mjs",
  ".cjs",
  ".php",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".rst",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const TEXT_BASENAMES = new Set([
  "Dockerfile",
  "Gemfile",
  "Makefile",
  "Procfile",
  "Pipfile",
  "README",
  "go.mod",
  "go.sum",
  "requirements.txt",
]);
const MANIFEST_PATTERNS = [
  /(^|\/)package(?:-lock)?\.json$/i,
  /(^|\/)pyproject\.toml$/i,
  /(^|\/)setup\.cfg$/i,
  /(^|\/)setup\.py$/i,
  /(^|\/)requirements[^/]*\.txt$/i,
  /(^|\/)Pipfile(?:\.lock)?$/i,
  /(^|\/)poetry\.lock$/i,
  /(^|\/)Cargo\.(?:toml|lock)$/i,
  /(^|\/)go\.(?:mod|sum)$/i,
  /(^|\/)Gemfile(?:\.lock)?$/i,
  /(^|\/)composer\.(?:json|lock)$/i,
  /(^|\/)Dockerfile$/i,
  /(^|\/)\.github\/workflows\/.*\.ya?ml$/i,
];
const EXCLUDED_CONTROL_PATHS = [
  /^portfolio\//,
  /^scripts\/consumer-inventory\.mjs$/,
  /^test\/consumer-inventory\.test\.mjs$/,
  /^\.github\/workflows\/portfolio-consumers\.yml$/,
  /^consumer-live\//,
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : canonicalize(value), "utf8");
  return createHash("sha256").update(data).digest("hex");
}

function parseDate(value) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

function normalizePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function normalizePackageName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || /[\r\n\0]/.test(trimmed)) return null;
  return trimmed;
}

function pythonAlias(value) {
  const normalized = normalizePackageName(value);
  if (!normalized) return null;
  const unscoped = normalized.includes("/") ? normalized.split("/").at(-1) : normalized;
  const alias = unscoped.replace(/[-.]+/g, "_");
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(alias) ? alias : null;
}

function isTextPath(path) {
  const name = basename(path);
  if (TEXT_BASENAMES.has(name)) return true;
  if (/^requirements[^/]*\.txt$/i.test(name)) return true;
  return TEXT_EXTENSIONS.has(extname(name).toLowerCase());
}

function isManifestPath(path) {
  return MANIFEST_PATTERNS.some((pattern) => pattern.test(path));
}

function isExcludedControlPath(repository, path) {
  return repository === ".github" && EXCLUDED_CONTROL_PATHS.some((pattern) => pattern.test(path));
}

function wordPattern(value) {
  return new RegExp(`(^|[^A-Za-z0-9_.@/-])${escapeRegExp(value)}(?=$|[^A-Za-z0-9_.@/-])`, "i");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTomlSection(content, section) {
  const lines = content.split(/\r?\n/);
  const expected = `[${section}]`;
  const collected = [];
  let active = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      if (active) break;
      active = trimmed === expected;
      continue;
    }
    if (active) collected.push(line);
  }
  return collected.join("\n");
}

function parseProjectName(content, fileName) {
  if (fileName === "pyproject.toml") {
    const project = parseTomlSection(content, "project");
    return /^\s*name\s*=\s*["']([^"']+)["']/m.exec(project)?.[1] ?? null;
  }
  if (fileName === "Cargo.toml") {
    const project = parseTomlSection(content, "package");
    return /^\s*name\s*=\s*["']([^"']+)["']/m.exec(project)?.[1] ?? null;
  }
  if (fileName === "setup.cfg") {
    const metadata = parseTomlSection(content, "metadata");
    return /^\s*name\s*=\s*([^\s#;]+)\s*$/m.exec(metadata)?.[1] ?? null;
  }
  if (fileName === "go.mod") return /^\s*module\s+([^\s]+)\s*$/m.exec(content)?.[1] ?? null;
  return null;
}

export function deriveRegisteredRepositories(registry) {
  const descriptors = new Map();
  function ensure(repository) {
    if (typeof repository !== "string" || !repository) return null;
    if (!descriptors.has(repository)) {
      descriptors.set(repository, {
        repository,
        targetIds: [],
        canonicalFor: [],
        companionFor: [],
        roles: [],
        states: [],
      });
    }
    return descriptors.get(repository);
  }

  for (const target of asArray(registry?.targets)) {
    if (!isRecord(target) || typeof target.id !== "string") continue;
    const canonical = ensure(target.canonicalRepository);
    if (canonical) canonical.canonicalFor.push(target.id);
    for (const companion of asArray(target.companionRepositories)) {
      const descriptor = ensure(companion);
      if (descriptor) descriptor.companionFor.push(target.id);
    }
    for (const source of asArray(target.sources)) {
      if (!isRecord(source)) continue;
      const descriptor = ensure(source.repository);
      if (!descriptor) continue;
      descriptor.targetIds.push(target.id);
      if (typeof source.role === "string") descriptor.roles.push(source.role);
      if (typeof source.state === "string") descriptor.states.push(source.state);
    }
  }
  for (const standalone of asArray(registry?.standaloneRepositories)) ensure(standalone?.repository);

  return [...descriptors.values()]
    .map((descriptor) => ({
      ...descriptor,
      targetIds: [...new Set(descriptor.targetIds)].sort(),
      canonicalFor: [...new Set(descriptor.canonicalFor)].sort(),
      companionFor: [...new Set(descriptor.companionFor)].sort(),
      roles: [...new Set(descriptor.roles)].sort(),
      states: [...new Set(descriptor.states)].sort(),
    }))
    .sort((left, right) => left.repository.localeCompare(right.repository));
}

async function pythonPackages(repositoryRoot) {
  const aliases = new Set();
  for (const base of [join(repositoryRoot, "src"), repositoryRoot]) {
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP_DIRECTORIES.has(entry.name)) continue;
      try {
        const init = await stat(join(base, entry.name, "__init__.py"));
        if (init.isFile() && /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name)) aliases.add(entry.name);
      } catch {
        // Not a Python package root.
      }
    }
  }
  return [...aliases].sort();
}

async function readOptionalText(path, errors, repository, label) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) return null;
    const content = await readFile(path, "utf8");
    if (content.includes("\0")) return null;
    return content;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    errors.push({ code: "MANIFEST_READ_ERROR", repository, path: label, message: String(error?.message ?? error) });
    return null;
  }
}

export async function deriveCatalog(workspace, descriptors) {
  const errors = [];
  const components = [];
  for (const descriptor of descriptors) {
    const repositoryRoot = join(workspace, descriptor.repository);
    let metadata;
    try {
      metadata = await stat(repositoryRoot);
    } catch (error) {
      errors.push({ code: "MISSING_REPOSITORY", repository: descriptor.repository, path: null, message: String(error?.message ?? error) });
      continue;
    }
    if (!metadata.isDirectory()) {
      errors.push({ code: "REPOSITORY_NOT_DIRECTORY", repository: descriptor.repository, path: null, message: "Workspace entry is not a directory." });
      continue;
    }

    let headSha = null;
    try {
      const value = (await readFile(join(repositoryRoot, ".consumer-head"), "utf8")).trim();
      if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error("HEAD evidence is not a 40-character Git SHA.");
      headSha = value.toLowerCase();
    } catch (error) {
      errors.push({ code: "HEAD_EVIDENCE_ERROR", repository: descriptor.repository, path: ".consumer-head", message: String(error?.message ?? error) });
    }

    const packageNames = new Set();
    const importRoots = new Set(await pythonPackages(repositoryRoot));
    const manifests = [
      "pyproject.toml",
      "package.json",
      "setup.cfg",
      "Cargo.toml",
      "go.mod",
    ];
    for (const manifest of manifests) {
      const content = await readOptionalText(join(repositoryRoot, manifest), errors, descriptor.repository, manifest);
      if (content === null) continue;
      if (manifest === "package.json") {
        try {
          const parsed = JSON.parse(content);
          const name = normalizePackageName(parsed?.name);
          if (name) packageNames.add(name);
        } catch (error) {
          errors.push({ code: "MANIFEST_PARSE_ERROR", repository: descriptor.repository, path: manifest, message: String(error?.message ?? error) });
        }
      } else {
        const name = normalizePackageName(parseProjectName(content, manifest));
        if (name) packageNames.add(name);
      }
    }
    for (const name of packageNames) {
      const alias = pythonAlias(name);
      if (alias) importRoots.add(alias);
    }

    components.push({
      ...descriptor,
      headSha,
      packageNames: [...packageNames].sort(),
      importRoots: [...importRoots].sort(),
    });
  }
  return { components: components.sort((left, right) => left.repository.localeCompare(right.repository)), errors };
}

async function collectTextFiles(repositoryRoot, repository, errors) {
  const files = [];
  const stack = [repositoryRoot];
  let symlinkCount = 0;
  while (stack.length > 0) {
    const directory = stack.pop();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      errors.push({ code: "DIRECTORY_READ_ERROR", repository, path: normalizePath(repositoryRoot, directory), message: String(error?.message ?? error) });
      continue;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) stack.push(path);
        continue;
      }
      if (entry.isSymbolicLink()) {
        symlinkCount += 1;
        continue;
      }
      if (!entry.isFile() || !isTextPath(path)) continue;
      let metadata;
      try {
        metadata = await lstat(path);
      } catch (error) {
        errors.push({ code: "FILE_STAT_ERROR", repository, path: normalizePath(repositoryRoot, path), message: String(error?.message ?? error) });
        continue;
      }
      if (metadata.size > MAX_FILE_BYTES) continue;
      files.push(path);
      if (files.length > MAX_FILES) {
        errors.push({ code: "FILE_LIMIT_EXCEEDED", repository, path: null, message: `More than ${MAX_FILES} text files were discovered.` });
        return { files, symlinkCount };
      }
    }
  }
  files.sort();
  return { files, symlinkCount };
}

function classifyExplicitReference(path, line) {
  if (/^\.github\/workflows\/.*\.ya?ml$/i.test(path) && /^\s*(?:-\s*)?uses\s*:/i.test(line)) return "WORKFLOW_USE";
  if (/https?:\/\/(?:www\.)?github\.com\//i.test(line)) return "REPOSITORY_LINK";
  return "REPOSITORY_REFERENCE";
}

function importPatterns(alias) {
  const escaped = escapeRegExp(alias);
  return [
    new RegExp(`^\\s*from\\s+${escaped}(?:\\.|\\s|$)`),
    new RegExp(`^\\s*import\\s+[^#\\n]*\\b${escaped}(?:\\.|\\s|,|$)`),
    new RegExp(`\\brequire\\(\\s*["']${escaped}(?:[/"'])`),
    new RegExp(`\\bfrom\\s*["']${escaped}(?:[/"'])`),
    new RegExp(`\\bimport\\(\\s*["']${escaped}(?:[/"'])`),
  ];
}

function referenceKey(reference) {
  return [reference.consumerRepository, reference.providerRepository, reference.kind, reference.path, reference.line, reference.token].join("\0");
}

export async function scanWorkspace(workspace, components) {
  const references = [];
  const errors = [];
  const scannedRepositories = [];
  const skippedSymlinks = {};
  const providerMatchers = components.map((component) => ({
    component,
    fullName: `vigilanty0x/${component.repository}`,
    fullNamePattern: new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRegExp(`vigilanty0x/${component.repository}`)}(?=$|[^A-Za-z0-9_.-])`, "i"),
    packagePatterns: component.packageNames
      .filter((name) => name.length >= 4)
      .map((name) => ({ name, pattern: wordPattern(name) })),
    importMatchers: component.importRoots
      .filter((alias) => alias.length >= 3)
      .map((alias) => ({ alias, patterns: importPatterns(alias) })),
  }));
  const seen = new Set();

  for (const consumer of components) {
    const repositoryRoot = join(workspace, consumer.repository);
    const localErrors = [];
    const { files, symlinkCount } = await collectTextFiles(repositoryRoot, consumer.repository, localErrors);
    errors.push(...localErrors);
    skippedSymlinks[consumer.repository] = symlinkCount;
    scannedRepositories.push({ repository: consumer.repository, headSha: consumer.headSha, textFileCount: files.length, skippedSymlinkCount: symlinkCount });

    for (const file of files) {
      const path = normalizePath(repositoryRoot, file);
      if (isExcludedControlPath(consumer.repository, path)) continue;
      let content;
      try {
        content = await readFile(file, "utf8");
      } catch (error) {
        errors.push({ code: "FILE_READ_ERROR", repository: consumer.repository, path, message: String(error?.message ?? error) });
        continue;
      }
      if (content.includes("\0")) continue;
      const lines = content.split(/\r?\n/);
      const manifest = isManifestPath(path);
      const codeImportPath = /\.(?:py|js|jsx|mjs|cjs|ts|tsx)$/i.test(path);

      for (const [lineIndex, line] of lines.entries()) {
        for (const matcher of providerMatchers) {
          const provider = matcher.component;
          if (provider.repository === consumer.repository) continue;

          if (matcher.fullNamePattern.test(line)) {
            const reference = {
              consumerRepository: consumer.repository,
              providerRepository: provider.repository,
              providerTargets: provider.targetIds,
              kind: classifyExplicitReference(path, line),
              path,
              line: lineIndex + 1,
              token: matcher.fullName,
            };
            const key = referenceKey(reference);
            if (!seen.has(key)) {
              seen.add(key);
              references.push(reference);
            }
          }

          if (manifest) {
            for (const packageMatcher of matcher.packagePatterns) {
              if (!packageMatcher.pattern.test(line)) continue;
              const reference = {
                consumerRepository: consumer.repository,
                providerRepository: provider.repository,
                providerTargets: provider.targetIds,
                kind: "PACKAGE_REFERENCE",
                path,
                line: lineIndex + 1,
                token: packageMatcher.name,
              };
              const key = referenceKey(reference);
              if (!seen.has(key)) {
                seen.add(key);
                references.push(reference);
              }
            }
          }

          if (codeImportPath) {
            for (const importMatcher of matcher.importMatchers) {
              if (!importMatcher.patterns.some((pattern) => pattern.test(line))) continue;
              const reference = {
                consumerRepository: consumer.repository,
                providerRepository: provider.repository,
                providerTargets: provider.targetIds,
                kind: "CODE_IMPORT",
                path,
                line: lineIndex + 1,
                token: importMatcher.alias,
              };
              const key = referenceKey(reference);
              if (!seen.has(key)) {
                seen.add(key);
                references.push(reference);
              }
            }
          }
        }
        if (references.length > MAX_REFERENCES) {
          errors.push({ code: "REFERENCE_LIMIT_EXCEEDED", repository: consumer.repository, path, message: `More than ${MAX_REFERENCES} references were discovered.` });
          return { references, errors, scannedRepositories, skippedSymlinks };
        }
      }
    }
  }

  references.sort((left, right) =>
    left.providerRepository.localeCompare(right.providerRepository)
      || left.consumerRepository.localeCompare(right.consumerRepository)
      || left.path.localeCompare(right.path)
      || left.line - right.line
      || left.kind.localeCompare(right.kind),
  );
  scannedRepositories.sort((left, right) => left.repository.localeCompare(right.repository));
  return { references, errors, scannedRepositories, skippedSymlinks };
}

function summarizeConsumers(components, references) {
  const byProvider = new Map(components.map((component) => [component.repository, {
    repository: component.repository,
    targetIds: component.targetIds,
    packageNames: component.packageNames,
    importRoots: component.importRoots,
    consumers: new Set(),
    kinds: new Set(),
    referenceCount: 0,
  }]));
  for (const reference of references) {
    const summary = byProvider.get(reference.providerRepository);
    if (!summary) continue;
    summary.consumers.add(reference.consumerRepository);
    summary.kinds.add(reference.kind);
    summary.referenceCount += 1;
  }
  return [...byProvider.values()]
    .map((summary) => ({
      repository: summary.repository,
      targetIds: summary.targetIds,
      packageNames: summary.packageNames,
      importRoots: summary.importRoots,
      consumerCount: summary.consumers.size,
      consumers: [...summary.consumers].sort(),
      referenceCount: summary.referenceCount,
      referenceKinds: [...summary.kinds].sort(),
    }))
    .sort((left, right) => right.consumerCount - left.consumerCount || right.referenceCount - left.referenceCount || left.repository.localeCompare(right.repository));
}

export async function buildInventory({ registry, registryBytes, workspace, now = new Date(), ttlDays = DEFAULT_TTL_DAYS }) {
  const observedAt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(observedAt.getTime())) throw new Error("Invalid observation time.");
  const descriptors = deriveRegisteredRepositories(registry);
  const catalog = await deriveCatalog(workspace, descriptors);
  const scan = await scanWorkspace(workspace, catalog.components);
  const errors = [...catalog.errors, ...scan.errors].sort((left, right) =>
    String(left.repository ?? "").localeCompare(String(right.repository ?? ""))
      || String(left.path ?? "").localeCompare(String(right.path ?? ""))
      || String(left.code ?? "").localeCompare(String(right.code ?? "")),
  );
  const consumers = summarizeConsumers(catalog.components, scan.references);
  const expected = registry.expectedPublicRepositoryCount;
  const repositoryCountMatches = Number.isInteger(expected) && expected === catalog.components.length;
  if (!repositoryCountMatches) {
    errors.push({ code: "REPOSITORY_COUNT_DRIFT", repository: null, path: null, message: `Registry expects ${expected}; workspace catalog contains ${catalog.components.length}.` });
  }
  const registryExpiry = parseDate(registry.expiresAt);
  if (!registryExpiry || registryExpiry <= observedAt) {
    errors.push({ code: "REGISTRY_EXPIRED", repository: null, path: "portfolio/targets.json", message: "Canonical registry evidence is expired or invalid." });
  }

  const snapshot = {
    schemaVersion: 1,
    owner: registry.owner,
    scope: "PUBLIC_ONLY",
    observedAt: observedAt.toISOString(),
    expiresAt: addDays(observedAt, ttlDays).toISOString(),
    registry: {
      observedAt: registry.observedAt,
      expiresAt: registry.expiresAt,
      sha256: digest(registryBytes),
      expectedPublicRepositoryCount: expected,
    },
    status: errors.length === 0 ? "PASS" : "FAIL",
    complete: errors.length === 0,
    counts: {
      registeredRepositoryCount: descriptors.length,
      scannedRepositoryCount: catalog.components.length,
      scannedTextFileCount: scan.scannedRepositories.reduce((total, item) => total + item.textFileCount, 0),
      skippedSymlinkCount: scan.scannedRepositories.reduce((total, item) => total + item.skippedSymlinkCount, 0),
      providerWithConsumerCount: consumers.filter((provider) => provider.consumerCount > 0).length,
      providerWithoutConsumerCount: consumers.filter((provider) => provider.consumerCount === 0).length,
      referenceCount: scan.references.length,
      errorCount: errors.length,
    },
    limitations: [
      "The scan observes current default-branch working trees only; it does not inspect Git history, packages outside the portfolio, or private repositories.",
      "Symbolic links are not followed and are counted separately.",
      "Repository links, workflow uses, package manifests, and common Python/JavaScript import forms are detected; dynamic references may remain invisible.",
      "A complete inventory is not a migration proof and does not authorize deprecation or archive.",
    ],
    repositories: scan.scannedRepositories,
    components: catalog.components,
    consumers,
    references: scan.references,
    errors,
  };
  snapshot.evidenceSha256 = digest(snapshot);
  return snapshot;
}

function renderMarkdown(snapshot) {
  const lines = [
    "## Public consumer inventory",
    "",
    `- Status: **${snapshot.status}**`,
    `- Observed: \`${snapshot.observedAt}\``,
    `- Expires: \`${snapshot.expiresAt}\``,
    `- Registry SHA-256: \`${snapshot.registry.sha256}\``,
    `- Evidence SHA-256: \`${snapshot.evidenceSha256}\``,
    `- Registered/scanned repositories: **${snapshot.counts.registeredRepositoryCount}/${snapshot.counts.scannedRepositoryCount}**`,
    `- Text files scanned: **${snapshot.counts.scannedTextFileCount}**`,
    `- References: **${snapshot.counts.referenceCount}**`,
    `- Providers with consumers: **${snapshot.counts.providerWithConsumerCount}**`,
    `- Providers without observed consumers: **${snapshot.counts.providerWithoutConsumerCount}**`,
    `- Errors: **${snapshot.counts.errorCount}**`,
    "",
    "### Highest observed consumer counts",
    "",
    "| Provider | Consumers | References | Kinds |",
    "| --- | ---: | ---: | --- |",
  ];
  const active = snapshot.consumers.filter((provider) => provider.consumerCount > 0).slice(0, 30);
  if (active.length === 0) lines.push("| _None observed_ | 0 | 0 | — |");
  for (const provider of active) {
    lines.push(`| \`${provider.repository}\` | ${provider.consumerCount} | ${provider.referenceCount} | ${provider.referenceKinds.join(", ") || "—"} |`);
  }
  lines.push("", "### Limitations", "");
  for (const limitation of snapshot.limitations) lines.push(`- ${limitation}`);
  if (snapshot.errors.length > 0) {
    lines.push("", "### Errors", "", "| Code | Repository | Path |", "| --- | --- | --- |");
    for (const error of snapshot.errors.slice(0, 50)) {
      lines.push(`| \`${error.code}\` | \`${error.repository ?? "—"}\` | \`${error.path ?? "—"}\` |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function writeReports(snapshot, jsonPath, markdownPath, manifestPath) {
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const markdown = renderMarkdown(snapshot);
  await mkdir(dirname(jsonPath), { recursive: true });
  await mkdir(dirname(markdownPath), { recursive: true });
  await writeFile(jsonPath, json);
  await writeFile(markdownPath, markdown);
  if (manifestPath) {
    const manifest = {
      schemaVersion: 1,
      observedAt: snapshot.observedAt,
      expiresAt: snapshot.expiresAt,
      evidenceSha256: snapshot.evidenceSha256,
      files: [
        { path: basename(jsonPath), bytes: Buffer.byteLength(json), sha256: digest(json) },
        { path: basename(markdownPath), bytes: Buffer.byteLength(markdown), sha256: digest(markdown) },
      ],
    };
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function parseArgs(argv) {
  const options = { root: ".", strict: false, ttlDays: DEFAULT_TTL_DAYS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") options.strict = true;
    else if (["--root", "--workspace", "--list-repositories", "--output-json", "--output-markdown", "--output-manifest", "--now", "--ttl-days"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${argument}.`);
      index += 1;
      const key = argument.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = value;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  const ttlDays = Number(options.ttlDays);
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 90) throw new Error("--ttl-days must be an integer from 1 to 90.");
  options.ttlDays = ttlDays;
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root);
  const registryPath = join(root, "portfolio", "targets.json");
  const registryBytes = await readFile(registryPath);
  const registry = JSON.parse(registryBytes.toString("utf8"));
  const repositories = deriveRegisteredRepositories(registry).map((descriptor) => descriptor.repository);

  if (options.listRepositories) {
    const path = resolve(options.listRepositories);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${repositories.join("\n")}\n`);
    process.stdout.write(`${JSON.stringify({ status: "PASS", repositoryCount: repositories.length, output: path })}\n`);
    return;
  }

  if (!options.workspace || !options.outputJson || !options.outputMarkdown) {
    throw new Error("--workspace, --output-json, and --output-markdown are required for inventory collection.");
  }
  const now = options.now ? new Date(options.now) : new Date();
  const snapshot = await buildInventory({
    registry,
    registryBytes,
    workspace: resolve(options.workspace),
    now,
    ttlDays: options.ttlDays,
  });
  await writeReports(
    snapshot,
    resolve(options.outputJson),
    resolve(options.outputMarkdown),
    options.outputManifest ? resolve(options.outputManifest) : null,
  );
  process.stdout.write(`${JSON.stringify({ status: snapshot.status, counts: snapshot.counts, evidenceSha256: snapshot.evidenceSha256 })}\n`);
  if (options.strict && snapshot.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

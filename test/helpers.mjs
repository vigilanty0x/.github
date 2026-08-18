import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXED_NOW = new Date("2026-08-18T12:00:00Z");

export async function createPortfolioFixture() {
  const root = await mkdtemp(join(tmpdir(), "portfolio-governance-"));
  await cp(join(PROJECT_ROOT, "portfolio"), join(root, "portfolio"), { recursive: true });
  return root;
}

export async function readJson(root, relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), "utf8"));
}

export async function writeJson(root, relativePath, value) {
  const destination = join(root, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function copyPortfolioInto(root) {
  await cp(join(PROJECT_ROOT, "portfolio"), join(root, "portfolio"), { recursive: true });
}

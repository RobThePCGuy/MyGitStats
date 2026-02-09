import * as fs from "node:fs";
import * as path from "node:path";
import { datePathParts } from "@mygitstats/shared";

/**
 * Resolve the repo root (monorepo root) by walking up from this file.
 */
function findRepoRoot(): string {
  let dir = path.resolve(import.meta.dirname, "..", "..", "..");
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not find monorepo root");
}

/** Absolute path to the data directory at the monorepo root. */
export function dataDir(): string {
  return path.join(findRepoRoot(), "data");
}

/** Absolute path for a daily file: data/daily/YYYY/MM/DD.json */
export function dailyPath(dateStr: string): string {
  const { year, month, day } = datePathParts(dateStr);
  return path.join(dataDir(), "daily", year, month, `${day}.json`);
}

/** Absolute path for a window file: data/windows/YYYY/MM/DD.json */
export function windowPath(dateStr: string): string {
  const { year, month, day } = datePathParts(dateStr);
  return path.join(dataDir(), "windows", year, month, `${day}.json`);
}

/** Read and parse a JSON file. Returns null if the file does not exist. */
export async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/** Write a JSON file, creating parent directories as needed. */
export async function writeJSON(filePath: string, data: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

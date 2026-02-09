import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigSchema, type Config } from "@mygitstats/shared";

/**
 * Locate the monorepo root by walking up from this file until we
 * find pnpm-workspace.yaml, then look for mygitstats.config.json.
 */
function findRepoRoot(): string {
  // Start from the collector app directory (src/../..)
  let dir = path.resolve(import.meta.dirname, "..", "..", "..");
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not find monorepo root (no pnpm-workspace.yaml)");
}

/**
 * Load and validate mygitstats.config.json from the repo root.
 * Falls back to schema defaults if the file does not exist.
 */
export function loadConfig(): Config {
  const repoRoot = findRepoRoot();
  const configPath = path.join(repoRoot, "mygitstats.config.json");

  if (!fs.existsSync(configPath)) {
    console.log("[config] No mygitstats.config.json found - using defaults");
    return ConfigSchema.parse({});
  }

  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    console.error("[config] Invalid config file:", result.error.format());
    throw new Error("Invalid mygitstats.config.json");
  }

  console.log("[config] Loaded mygitstats.config.json");
  return result.data;
}

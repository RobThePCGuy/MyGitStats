import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DailyFileSchema,
  WindowFileSchema,
  RepoMetaSchema,
  LastRunSchema,
} from "@mygitstats/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const DATA = resolve(ROOT, "data");

let errors = 0;
let checked = 0;

function validate(
  filePath: string,
  schema: { safeParse: (data: unknown) => { success: boolean; error?: unknown } },
) {
  const rel = relative(ROOT, filePath);
  if (!existsSync(filePath)) return;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    const result = schema.safeParse(raw);
    if (!result.success) {
      console.error(`FAIL: ${rel}`);
      console.error(result.error);
      errors++;
    } else {
      console.log(`  OK: ${rel}`);
    }
    checked++;
  } catch (e) {
    console.error(`FAIL: ${rel} - ${e}`);
    errors++;
    checked++;
  }
}

function findJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".json")) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

console.log("Verifying data files...\n");

// Daily files
for (const f of findJsonFiles(resolve(DATA, "daily"))) {
  validate(f, DailyFileSchema);
}

// Window files
for (const f of findJsonFiles(resolve(DATA, "windows"))) {
  validate(f, WindowFileSchema);
}

// Meta files
const reposFile = resolve(DATA, "meta", "repos.json");
if (existsSync(reposFile)) {
  validate(reposFile, RepoMetaSchema);
}

const lastRunFile = resolve(DATA, "meta", "last-run.json");
if (existsSync(lastRunFile)) {
  validate(lastRunFile, LastRunSchema);
}

if (checked === 0) {
  console.log("No data files found to verify.");
} else {
  console.log(
    `\nChecked ${checked} file(s). ${errors === 0 ? "All valid." : `${errors} error(s) found.`}`,
  );
}

if (errors > 0) process.exit(1);

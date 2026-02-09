/**
 * Build-time data transform: raw data/ -> published dataset.
 *
 * Reads from the project-root data/ directory and writes the dashboard-ready
 * JSON files into apps/dashboard/public/data/.
 *
 * Run via: pnpm --filter @mygitstats/dashboard run prepare-data
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ConfigSchema,
  DailyFileSchema,
  WindowFileSchema,
  RepoMetaSchema,
  type DailyFile,
  type RepoMetaEntry,
  type WindowFile,
} from "@mygitstats/shared";

import type {
  DashboardIndex,
  RepoSummary,
  RepoTimeSeries,
  DayEntry,
  WeekOverWeek,
  Delta,
  ContributionsData,
  ReferrersData,
} from "./types.js";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Project root (four levels up from src/lib/prepare-data.ts). */
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "apps", "dashboard", "public", "data");

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function readJSON(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJSON(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Recursively find all files matching a pattern in a directory.
 * Returns absolute paths sorted alphabetically (chronological for dated dirs).
 */
function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  function walk(d: string): void {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(ext)) {
        results.push(full);
      }
    }
  }

  walk(dir);
  results.sort();
  return results;
}

/**
 * Compute a percentage-change Delta.
 * If previous=0 and current>0: change=1 (100%).
 * If both 0: change=0.
 */
function computeDelta(current: number, previous: number): Delta {
  let change: number;
  if (previous === 0) {
    change = current > 0 ? 1 : 0;
  } else {
    change = (current - previous) / previous;
  }
  return { current, previous, change };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

function main(): void {
  console.log("prepare-data: starting build-time data transform...");

  // -- 1. Read config --
  const configPath = path.join(PROJECT_ROOT, "mygitstats.config.json");
  if (!fs.existsSync(configPath)) {
    console.warn("prepare-data: mygitstats.config.json not found, using defaults");
  }
  const rawConfig = fs.existsSync(configPath) ? readJSON(configPath) : {};
  const config = ConfigSchema.parse(rawConfig);

  // -- 2. Read repo metadata --
  const metaPath = path.join(DATA_DIR, "meta", "repos.json");
  let repoMeta: RepoMetaEntry[] = [];
  if (fs.existsSync(metaPath)) {
    const parsed = RepoMetaSchema.parse(readJSON(metaPath));
    repoMeta = parsed.repos;
  } else {
    console.warn("prepare-data: data/meta/repos.json not found, no repo metadata available");
  }

  const metaById = new Map<number, RepoMetaEntry>();
  for (const r of repoMeta) {
    metaById.set(r.id, r);
  }

  // -- 3. Determine which repos to include (privacy filter) --
  const publishPrivateSet = new Set(config.publishPrivateRepos);

  function isRepoIncluded(id: number, fullName: string): boolean {
    const meta = metaById.get(id);
    if (!meta) return true; // no metadata - include by default
    if (!meta.isPrivate) return true; // public repos always included
    return publishPrivateSet.has(fullName);
  }

  // -- 4. Scan daily files --
  const dailyDir = path.join(DATA_DIR, "daily");
  const dailyFiles = findFiles(dailyDir, ".json");

  if (dailyFiles.length === 0) {
    console.log("prepare-data: no daily files found, writing empty dataset");
    writeEmptyDataset();
    return;
  }

  console.log(`prepare-data: found ${dailyFiles.length} daily file(s)`);

  // Parse all daily files and collect data per repo
  const allDays: DailyFile[] = [];
  for (const f of dailyFiles) {
    try {
      const parsed = DailyFileSchema.parse(readJSON(f));
      allDays.push(parsed);
    } catch (err) {
      console.warn(`prepare-data: skipping invalid daily file ${f}: ${err}`);
    }
  }

  // Sort by date ascending
  allDays.sort((a, b) => a.date.localeCompare(b.date));

  // Collect all contribution days across all daily files
  const contributionMap = new Map<string, number>();
  for (const day of allDays) {
    if (day.contributions) {
      for (const c of day.contributions) {
        // Later files overwrite earlier ones for the same date
        contributionMap.set(c.date, c.count);
      }
    }
  }

  // Build per-repo time series data
  // Map from repo ID -> { meta info, day entries keyed by date }
  interface RepoAccumulator {
    id: number;
    fullName: string;
    dayMap: Map<string, DayEntry>;
  }

  const repoAccum = new Map<number, RepoAccumulator>();
  const privateReposPublished: string[] = [];

  for (const day of allDays) {
    for (const [idStr, entry] of Object.entries(day.repos)) {
      const id = Number(idStr);

      if (!isRepoIncluded(id, entry.fullName)) continue;

      // Track private repos that will be published
      const meta = metaById.get(id);
      if (meta?.isPrivate && publishPrivateSet.has(entry.fullName)) {
        if (!privateReposPublished.includes(entry.fullName)) {
          privateReposPublished.push(entry.fullName);
        }
      }

      let accum = repoAccum.get(id);
      if (!accum) {
        accum = { id, fullName: entry.fullName, dayMap: new Map() };
        repoAccum.set(id, accum);
      }

      const dayEntry: DayEntry = {
        date: day.date,
        views: entry.traffic?.views ?? 0,
        viewsUnique: entry.traffic?.viewsUnique ?? 0,
        clones: entry.traffic?.clones ?? 0,
        clonesUnique: entry.traffic?.clonesUnique ?? 0,
        stars: entry.snapshot?.stars ?? 0,
        forks: entry.snapshot?.forks ?? 0,
      };

      accum.dayMap.set(day.date, dayEntry);
    }
  }

  // Warn about private repos being published
  if (privateReposPublished.length > 0) {
    console.warn(
      "\x1b[33m\x1b[1m" +
        `prepare-data WARNING: Publishing ${privateReposPublished.length} private repo(s): ` +
        privateReposPublished.join(", ") +
        "\x1b[0m",
    );
  }

  // -- 5. Determine date range --
  const allDates = allDays.map((d) => d.date).sort();
  const startDate = allDates[0];
  const endDate = allDates[allDates.length - 1];

  // -- 6. Build per-repo output files --
  const last7Dates = allDates.slice(-7);
  const prev7Dates = allDates.slice(-14, -7);

  const repoSummaries: RepoSummary[] = [];

  for (const [id, accum] of repoAccum) {
    const meta = metaById.get(id);

    // Sort days chronologically
    const days = Array.from(accum.dayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Compute week-over-week
    const currentViews = sumField(accum.dayMap, last7Dates, "views");
    const previousViews = sumField(accum.dayMap, prev7Dates, "views");
    const currentClones = sumField(accum.dayMap, last7Dates, "clones");
    const previousClones = sumField(accum.dayMap, prev7Dates, "clones");

    // Stars: use the latest snapshot value, delta is last vs previous
    const currentStarsDay = findLatestEntry(accum.dayMap, last7Dates);
    const previousStarsDay = findLatestEntry(accum.dayMap, prev7Dates);
    const currentStars = currentStarsDay?.stars ?? 0;
    const previousStars = previousStarsDay?.stars ?? 0;
    const starsGained = currentStars - previousStars;

    const weekOverWeek: WeekOverWeek = {
      views: computeDelta(currentViews, previousViews),
      clones: computeDelta(currentClones, previousClones),
      stars: computeDelta(currentStars, previousStars),
    };

    const repoTimeSeries: RepoTimeSeries = {
      id,
      fullName: accum.fullName,
      days,
      weekOverWeek,
    };

    // Write per-repo file
    const [owner, repo] = accum.fullName.split("/");
    writeJSON(path.join(OUTPUT_DIR, "repos", owner, `${repo}.json`), repoTimeSeries);

    // Latest snapshot for summary
    const latestDay = days[days.length - 1];

    repoSummaries.push({
      id,
      fullName: accum.fullName,
      language: meta?.language ?? null,
      description: meta?.description ?? null,
      stars: latestDay?.stars ?? 0,
      forks: latestDay?.forks ?? 0,
      viewsThisWeek: currentViews,
      clonesThisWeek: currentClones,
      starsGainedThisWeek: starsGained,
    });
  }

  // Sort by stars descending
  repoSummaries.sort((a, b) => b.stars - a.stars);

  // -- 7. Build index.json --
  const totals = {
    repos: repoSummaries.length,
    stars: repoSummaries.reduce((s, r) => s + r.stars, 0),
    forks: repoSummaries.reduce((s, r) => s + r.forks, 0),
    views: repoSummaries.reduce((s, r) => s + r.viewsThisWeek, 0),
    clones: repoSummaries.reduce((s, r) => s + r.clonesThisWeek, 0),
  };

  const index: DashboardIndex = {
    generatedAt: new Date().toISOString(),
    dateRange: { start: startDate, end: endDate },
    totals,
    repos: repoSummaries,
  };

  writeJSON(path.join(OUTPUT_DIR, "index.json"), index);

  // -- 8. Build contributions.json --
  const contributionDays = Array.from(contributionMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const contributions: ContributionsData = { days: contributionDays };
  writeJSON(path.join(OUTPUT_DIR, "contributions.json"), contributions);

  // -- 9. Build referrers.json from latest window file --
  const windowDir = path.join(DATA_DIR, "windows");
  const windowFiles = findFiles(windowDir, ".json");

  if (windowFiles.length > 0) {
    const latestWindowPath = windowFiles[windowFiles.length - 1];
    try {
      const windowData = WindowFileSchema.parse(readJSON(latestWindowPath));
      const referrers = buildReferrers(windowData, (id, fullName) =>
        isRepoIncluded(id, fullName),
      );
      writeJSON(path.join(OUTPUT_DIR, "referrers.json"), referrers);
    } catch (err) {
      console.warn(`prepare-data: skipping invalid window file: ${err}`);
      writeJSON(path.join(OUTPUT_DIR, "referrers.json"), { date: "", repos: {} });
    }
  } else {
    writeJSON(path.join(OUTPUT_DIR, "referrers.json"), { date: "", repos: {} });
  }

  console.log(
    `prepare-data: wrote dataset to ${OUTPUT_DIR} ` +
      `(${repoSummaries.length} repos, ${allDays.length} days)`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumField(
  dayMap: Map<string, DayEntry>,
  dates: string[],
  field: "views" | "clones",
): number {
  let total = 0;
  for (const d of dates) {
    const entry = dayMap.get(d);
    if (entry) total += entry[field];
  }
  return total;
}

function findLatestEntry(
  dayMap: Map<string, DayEntry>,
  dates: string[],
): DayEntry | undefined {
  // Walk backwards to find the most recent entry
  for (let i = dates.length - 1; i >= 0; i--) {
    const entry = dayMap.get(dates[i]);
    if (entry) return entry;
  }
  return undefined;
}

function buildReferrers(
  windowData: WindowFile,
  isIncluded: (id: number, fullName: string) => boolean,
): ReferrersData {
  const repos: ReferrersData["repos"] = {};

  for (const [idStr, entry] of Object.entries(windowData.repos)) {
    const id = Number(idStr);
    if (!isIncluded(id, entry.fullName)) continue;

    repos[entry.fullName] = {
      referrers: entry.referrers.map((r) => ({
        referrer: r.referrer,
        count: r.count,
        uniques: r.uniques,
      })),
      paths: entry.paths.map((p) => ({
        path: p.path,
        title: p.title,
        count: p.count,
        uniques: p.uniques,
      })),
    };
  }

  return { date: windowData.date, repos };
}

function writeEmptyDataset(): void {
  const index: DashboardIndex = {
    generatedAt: new Date().toISOString(),
    dateRange: { start: "", end: "" },
    totals: { repos: 0, stars: 0, forks: 0, views: 0, clones: 0 },
    repos: [],
  };
  writeJSON(path.join(OUTPUT_DIR, "index.json"), index);
  writeJSON(path.join(OUTPUT_DIR, "contributions.json"), { days: [] });
  writeJSON(path.join(OUTPUT_DIR, "referrers.json"), { date: "", repos: {} });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main();

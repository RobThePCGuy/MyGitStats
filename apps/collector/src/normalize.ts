import { toDateString } from "@mygitstats/shared";
import type {
  DailyFile,
  DailyRepoEntry,
  WindowFile,
  Snapshot,
  ContributionDay,
  RepoMetaEntry,
} from "@mygitstats/shared";
import { dailyPath, windowPath, readJSON, writeJSON } from "./fileio.js";
import type { TrafficResult } from "./fetchTraffic.js";

const collectorVersion = process.env.COLLECTOR_VERSION ?? "local";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a traffic timestamp (ISO 8601) to a YYYY-MM-DD date string.
 */
function tsToDate(timestamp: string): string {
  return toDateString(new Date(timestamp));
}

// ---------------------------------------------------------------------------
// Daily files
// ---------------------------------------------------------------------------

/**
 * Merge traffic data from all repos into per-day daily files.
 * For each repo + day, uses Math.max of existing vs new counts so that
 * re-running the collector never loses data.
 */
export async function writeDailyFiles(
  trafficByRepo: Map<number, TrafficResult>,
  snapshots: Map<number, Snapshot>,
  contributions: ContributionDay[],
  repos: RepoMetaEntry[],
  todayStr: string
): Promise<void> {
  // Collect all dates that need daily files
  const datesToWrite = new Set<string>();
  datesToWrite.add(todayStr);

  for (const traffic of trafficByRepo.values()) {
    for (const v of traffic.views) datesToWrite.add(tsToDate(v.timestamp));
    for (const c of traffic.clones) datesToWrite.add(tsToDate(c.timestamp));
  }

  // Build a lookup for repos by id
  const repoById = new Map<number, RepoMetaEntry>();
  for (const r of repos) repoById.set(r.id, r);

  const now = new Date().toISOString();

  for (const dateStr of datesToWrite) {
    const filePath = dailyPath(dateStr);
    const existing = await readJSON<DailyFile>(filePath);

    const repoEntries: Record<number, DailyRepoEntry> = existing?.repos
      ? { ...existing.repos }
      : {};

    // Merge traffic data for this date
    for (const [repoId, traffic] of trafficByRepo) {
      const meta = repoById.get(repoId);
      if (!meta) continue;

      const entry: DailyRepoEntry = repoEntries[repoId] ?? {
        fullName: meta.fullName,
        isPrivate: meta.isPrivate,
      };
      entry.fullName = meta.fullName;

      const existingTraffic = entry.traffic ?? {
        views: 0,
        viewsUnique: 0,
        clones: 0,
        clonesUnique: 0,
      };

      // Sum views for this date
      const dayViews = traffic.views.filter((v) => tsToDate(v.timestamp) === dateStr);
      let viewCount = existingTraffic.views;
      let viewUniques = existingTraffic.viewsUnique;
      for (const v of dayViews) {
        viewCount = Math.max(viewCount, v.count);
        viewUniques = Math.max(viewUniques, v.uniques);
      }

      // Sum clones for this date
      const dayClones = traffic.clones.filter((c) => tsToDate(c.timestamp) === dateStr);
      let cloneCount = existingTraffic.clones;
      let cloneUniques = existingTraffic.clonesUnique;
      for (const c of dayClones) {
        cloneCount = Math.max(cloneCount, c.count);
        cloneUniques = Math.max(cloneUniques, c.uniques);
      }

      // Only write traffic if we have non-zero data or existing data
      if (viewCount > 0 || viewUniques > 0 || cloneCount > 0 || cloneUniques > 0) {
        entry.traffic = {
          views: viewCount,
          viewsUnique: viewUniques,
          clones: cloneCount,
          clonesUnique: cloneUniques,
        };
      }

      repoEntries[repoId] = entry;
    }

    // Add snapshots only for today's file
    if (dateStr === todayStr) {
      for (const [repoId, snapshot] of snapshots) {
        const meta = repoById.get(repoId);
        if (!meta) continue;
        const entry: DailyRepoEntry = repoEntries[repoId] ?? {
          fullName: meta.fullName,
          isPrivate: meta.isPrivate,
        };
        entry.fullName = meta.fullName;
        entry.snapshot = snapshot;
        repoEntries[repoId] = entry;
      }
    }

    const dailyFile: DailyFile = {
      schemaVersion: 1,
      date: dateStr,
      collectedAt: now,
      collectorVersion,
      repos: repoEntries,
    };

    // Add contributions for today's file
    if (dateStr === todayStr && contributions.length > 0) {
      dailyFile.contributions = contributions;
    }

    await writeJSON(filePath, dailyFile);
  }

  console.log(`[normalize] Wrote ${datesToWrite.size} daily file(s)`);
}

// ---------------------------------------------------------------------------
// Window files
// ---------------------------------------------------------------------------

/**
 * Write the window file (referrers and popular paths) for today.
 * This is a 14-day aggregate snapshot from GitHub's API.
 */
export async function writeWindowFile(
  trafficByRepo: Map<number, TrafficResult>,
  repos: RepoMetaEntry[],
  todayStr: string
): Promise<void> {
  const repoById = new Map<number, RepoMetaEntry>();
  for (const r of repos) repoById.set(r.id, r);

  const windowRepos: WindowFile["repos"] = {};

  for (const [repoId, traffic] of trafficByRepo) {
    const meta = repoById.get(repoId);
    if (!meta) continue;

    // Only write if there's actual referrer/path data
    if (traffic.referrers.length === 0 && traffic.paths.length === 0) continue;

    windowRepos[repoId] = {
      fullName: meta.fullName,
      referrers: traffic.referrers,
      paths: traffic.paths,
    };
  }

  if (Object.keys(windowRepos).length === 0) {
    console.log("[normalize] No referrer/path data to write for window file");
    return;
  }

  const windowFile: WindowFile = {
    schemaVersion: 1,
    date: todayStr,
    collectedAt: new Date().toISOString(),
    collectorVersion,
    repos: windowRepos,
  };

  const filePath = windowPath(todayStr);
  await writeJSON(filePath, windowFile);
  console.log(`[normalize] Wrote window file for ${todayStr}`);
}

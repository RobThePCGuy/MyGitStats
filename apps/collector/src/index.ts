import type { Octokit } from "octokit";
import { todayUTC, subtractDays } from "@mygitstats/shared";
import type { RepoMeta, LastRun, RepoMetaEntry, ContributionDay } from "@mygitstats/shared";
import { resolveAuth, isMultiOwnerAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { discoverReposPat } from "./discoverRepos.js";
import { discoverReposApp, type RoutedRepoMeta } from "./discoverReposApp.js";
import { writeRoutingFile } from "./routing.js";
import { fetchTraffic, type TrafficResult } from "./fetchTraffic.js";
import { fetchRepoSnapshots } from "./fetchRepoSnapshots.js";
import { fetchContributions } from "./fetchContrib.js";
import { writeDailyFiles, writeWindowFile } from "./normalize.js";
import { mapWithConcurrency } from "./concurrency.js";
import { dataDir, writeJSON } from "./fileio.js";
import * as path from "node:path";

const collectorVersion = process.env.COLLECTOR_VERSION ?? "local";

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  console.log("=== MyGitStats Collector ===");
  console.log(`Started at ${startedAt}`);

  // --- Load config ---
  const config = loadConfig();

  // --- Resolve auth (auto-detect PAT vs GitHub App) ---
  const auth = resolveAuth();
  const octokit = auth.createOctokit() as Octokit;
  const authMode = auth.tokenType() === "classic-pat" ? "pat" as const : "app" as const;
  console.log(`[auth] Mode: ${authMode} (${auth.tokenType()})`);

  // --- Discover repos ---
  let repos: RepoMetaEntry[];
  let routedRepos: RoutedRepoMeta[] | null = null;
  try {
    if (isMultiOwnerAuth(auth)) {
      routedRepos = await discoverReposApp(auth, config);
      repos = routedRepos;

      // Write routing metadata for debugging
      const repoIdToOwner: Record<string, string> = {};
      for (const r of routedRepos) {
        repoIdToOwner[String(r.id)] = r.installationOwner;
      }
      await writeRoutingFile(repoIdToOwner);
    } else {
      repos = await discoverReposPat(octokit, config);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[discover] Fatal error:", msg);
    errors.push(`discover: ${msg}`);
    repos = [];
  }

  if (repos.length === 0) {
    console.warn("[main] No repos discovered - writing meta files and exiting");
    await writeMetaFiles(repos, startedAt, 0, errors, authMode);
    return;
  }

  const todayStr = todayUTC();

  // --- Build per-repo Octokit resolver ---
  // In app mode, each repo routes through its owner's installation token.
  // In PAT mode, everything uses the single octokit.
  const ownerMap = new Map<number, string>();
  if (routedRepos) {
    for (const r of routedRepos) {
      ownerMap.set(r.id, r.installationOwner);
    }
  }

  function octokitForRepo(repoId: number): Octokit {
    if (isMultiOwnerAuth(auth)) {
      const owner = ownerMap.get(repoId);
      if (!owner) {
        throw new Error(`[routing] No installationOwner for repo id=${repoId} in app mode`);
      }
      return auth.octokitForOwner(owner);
    }
    return octokit;
  }

  // --- Fetch traffic (concurrent) ---
  console.log(`[traffic] Fetching traffic for ${repos.length} repos (concurrency: ${config.maxConcurrency})`);
  const trafficByRepo = new Map<number, TrafficResult>();
  let trafficCollected = 0;

  await mapWithConcurrency(repos, config.maxConcurrency, async (repo) => {
    try {
      const repoOctokit = octokitForRepo(repo.id);
      const result = await fetchTraffic(repoOctokit, repo);
      if (result) {
        trafficByRepo.set(repo.id, result);
        trafficCollected++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[traffic] Error for ${repo.fullName}: ${msg}`);
      errors.push(`traffic(${repo.fullName}): ${msg}`);
    }
  });

  console.log(`[traffic] Collected traffic for ${trafficCollected}/${repos.length} repos`);

  // --- Fetch snapshots (batched GraphQL) ---
  let snapshots = new Map<number, import("@mygitstats/shared").Snapshot>();
  try {
    if (isMultiOwnerAuth(auth)) {
      // Group repos by owner, batch within each group
      const byOwner = new Map<string, { id: number; fullName: string }[]>();
      for (const repo of repos) {
        const owner = ownerMap.get(repo.id);
        if (!owner) {
          console.error(`[snapshots] No installationOwner for repo id=${repo.id}, skipping`);
          continue;
        }
        let group = byOwner.get(owner);
        if (!group) {
          group = [];
          byOwner.set(owner, group);
        }
        group.push({ id: repo.id, fullName: repo.fullName });
      }

      for (const [owner, group] of byOwner) {
        const ownerOctokit = auth.octokitForOwner(owner);
        const ownerSnapshots = await fetchRepoSnapshots(ownerOctokit, group);
        for (const [id, snapshot] of ownerSnapshots) {
          snapshots.set(id, snapshot);
        }
      }
    } else {
      snapshots = await fetchRepoSnapshots(octokit, repos);
    }
    console.log(`[snapshots] Got snapshots for ${snapshots.size}/${repos.length} repos`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[snapshots] Fatal error:", msg);
    errors.push(`snapshots: ${msg}`);
  }

  // --- Fetch contributions (PAT only) ---
  let contributions: ContributionDay[] = [];
  if (authMode === "pat") {
    const contribFrom = subtractDays(todayStr, 30);
    contributions = await fetchContributions(octokit, contribFrom, todayStr);
  } else {
    console.log("[contrib] Skipped - contributions require PAT auth mode");
  }

  // --- Normalize and write daily/window files ---
  try {
    await writeDailyFiles(trafficByRepo, snapshots, contributions, repos, todayStr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[normalize] Error writing daily files:", msg);
    errors.push(`writeDailyFiles: ${msg}`);
  }

  try {
    await writeWindowFile(trafficByRepo, repos, todayStr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[normalize] Error writing window file:", msg);
    errors.push(`writeWindowFile: ${msg}`);
  }

  // --- Write meta files ---
  const reposCollected = trafficByRepo.size + snapshots.size > 0
    ? new Set([...trafficByRepo.keys(), ...snapshots.keys()]).size
    : 0;

  await writeMetaFiles(repos, startedAt, reposCollected, errors, authMode);

  console.log("=== Collection complete ===");
  if (errors.length > 0) {
    console.warn(`Finished with ${errors.length} error(s)`);
  }
}

async function writeMetaFiles(
  repos: RepoMetaEntry[],
  startedAt: string,
  reposCollected: number,
  errors: string[],
  authMode: "pat" | "app",
): Promise<void> {
  const base = dataDir();

  // repos.json
  const repoMeta: RepoMeta = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    repos,
  };
  await writeJSON(path.join(base, "repos.json"), repoMeta);
  console.log(`[meta] Wrote repos.json (${repos.length} repos)`);

  // last-run.json
  const lastRun: LastRun = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    collectorVersion,
    authMode,
    reposDiscovered: repos.length,
    reposCollected,
    errors,
  };
  await writeJSON(path.join(base, "last-run.json"), lastRun);
  console.log("[meta] Wrote last-run.json");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

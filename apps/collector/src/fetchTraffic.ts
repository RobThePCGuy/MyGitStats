import type { Octokit } from "octokit";
import type { Referrer, PopularPath } from "@mygitstats/shared";

export interface TrafficResult {
  views: { timestamp: string; count: number; uniques: number }[];
  clones: { timestamp: string; count: number; uniques: number }[];
  referrers: Referrer[];
  paths: PopularPath[];
}

/**
 * Fetch traffic data for a single repository.
 * Makes 4 REST calls: views, clones, referrers, and popular paths.
 * Returns null if all calls fail (e.g. 403 for insufficient permissions).
 */
export async function fetchTraffic(
  octokit: Octokit,
  repo: { id: number; fullName: string }
): Promise<TrafficResult | null> {
  const [owner, repoName] = repo.fullName.split("/");

  let views: TrafficResult["views"] = [];
  let clones: TrafficResult["clones"] = [];
  let referrers: Referrer[] = [];
  let paths: PopularPath[] = [];
  let anySuccess = false;

  // --- Views ---
  try {
    const resp = await octokit.rest.repos.getViews({
      owner,
      repo: repoName,
      per: "day",
    });
    views = (resp.data.views ?? []).map((v) => ({
      timestamp: v.timestamp,
      count: v.count,
      uniques: v.uniques,
    }));
    anySuccess = true;
  } catch (err) {
    logTrafficWarning("views", repo.fullName, err);
  }

  // --- Clones ---
  try {
    const resp = await octokit.rest.repos.getClones({
      owner,
      repo: repoName,
      per: "day",
    });
    clones = (resp.data.clones ?? []).map((c) => ({
      timestamp: c.timestamp,
      count: c.count,
      uniques: c.uniques,
    }));
    anySuccess = true;
  } catch (err) {
    logTrafficWarning("clones", repo.fullName, err);
  }

  // --- Referrers ---
  try {
    const resp = await octokit.rest.repos.getTopReferrers({
      owner,
      repo: repoName,
    });
    referrers = resp.data.map((r) => ({
      referrer: r.referrer,
      count: r.count,
      uniques: r.uniques,
    }));
    anySuccess = true;
  } catch (err) {
    logTrafficWarning("referrers", repo.fullName, err);
  }

  // --- Popular Paths ---
  try {
    const resp = await octokit.rest.repos.getTopPaths({
      owner,
      repo: repoName,
    });
    paths = resp.data.map((p) => ({
      path: p.path,
      title: p.title,
      count: p.count,
      uniques: p.uniques,
    }));
    anySuccess = true;
  } catch (err) {
    logTrafficWarning("paths", repo.fullName, err);
  }

  if (!anySuccess) {
    console.warn(`[traffic] All traffic calls failed for ${repo.fullName}`);
    return null;
  }

  return { views, clones, referrers, paths };
}

function logTrafficWarning(endpoint: string, repoName: string, err: unknown): void {
  const status = (err as { status?: number }).status;
  if (status === 403) {
    console.warn(
      `[traffic] 403 on ${endpoint} for ${repoName} - insufficient permissions, skipping`
    );
  } else {
    console.warn(
      `[traffic] Failed to fetch ${endpoint} for ${repoName}:`,
      err instanceof Error ? err.message : err
    );
  }
}

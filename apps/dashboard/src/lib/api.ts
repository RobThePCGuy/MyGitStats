import type {
  DashboardIndex,
  RepoTimeSeries,
  ContributionsData,
  ReferrersData,
} from "./types.js";

const BASE = import.meta.env.BASE_URL;

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export function fetchIndex(): Promise<DashboardIndex> {
  return fetchJSON<DashboardIndex>("index.json");
}

export function fetchRepo(
  owner: string,
  repo: string,
): Promise<RepoTimeSeries> {
  return fetchJSON<RepoTimeSeries>(`repos/${owner}/${repo}.json`);
}

export function fetchContributions(): Promise<ContributionsData> {
  return fetchJSON<ContributionsData>("contributions.json");
}

export function fetchReferrers(): Promise<ReferrersData> {
  return fetchJSON<ReferrersData>("referrers.json");
}

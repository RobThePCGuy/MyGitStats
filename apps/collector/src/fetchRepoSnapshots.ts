import type { Octokit } from "octokit";
import type { Snapshot } from "@mygitstats/shared";

/**
 * Batch-fetch repository snapshots via GraphQL.
 * Uses aliases to query up to 30 repos per request.
 */
export async function fetchRepoSnapshots(
  octokit: Octokit,
  repos: { id: number; fullName: string }[]
): Promise<Map<number, Snapshot>> {
  const results = new Map<number, Snapshot>();

  // Process in batches of 30
  const BATCH_SIZE = 30;
  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(repos.length / BATCH_SIZE);
    console.log(`[snapshots] Fetching batch ${batchNum}/${totalBatches} (${batch.length} repos)`);

    const batchResults = await fetchSnapshotBatch(octokit, batch);
    for (const [id, snapshot] of batchResults) {
      results.set(id, snapshot);
    }
  }

  return results;
}

async function fetchSnapshotBatch(
  octokit: Octokit,
  batch: { id: number; fullName: string }[]
): Promise<Map<number, Snapshot>> {
  const results = new Map<number, Snapshot>();

  // Build aliased GraphQL query
  const fragments = batch.map((repo, idx) => {
    const [owner, name] = repo.fullName.split("/");
    const alias = `repo_${idx}`;
    return `${alias}: repository(owner: "${owner}", name: "${name}") {
      stargazerCount
      forkCount
      issues(states: OPEN) { totalCount }
      pullRequests(states: OPEN) { totalCount }
      watchers { totalCount }
      diskUsage
    }`;
  });

  const query = `query { ${fragments.join("\n")} }`;

  try {
    const response = await octokit.graphql<Record<string, RepoGraphQLResult | null>>(query);

    batch.forEach((repo, idx) => {
      const alias = `repo_${idx}`;
      const data = response[alias];
      if (data) {
        results.set(repo.id, {
          stars: data.stargazerCount,
          forks: data.forkCount,
          openIssues: data.issues.totalCount,
          openPRs: data.pullRequests.totalCount,
          watchers: data.watchers.totalCount,
          size: data.diskUsage,
        });
      } else {
        console.warn(`[snapshots] No data returned for ${repo.fullName} (may be inaccessible)`);
      }
    });
  } catch (err) {
    console.error(
      `[snapshots] GraphQL batch failed:`,
      err instanceof Error ? err.message : err
    );
  }

  return results;
}

interface RepoGraphQLResult {
  stargazerCount: number;
  forkCount: number;
  issues: { totalCount: number };
  pullRequests: { totalCount: number };
  watchers: { totalCount: number };
  diskUsage: number;
}

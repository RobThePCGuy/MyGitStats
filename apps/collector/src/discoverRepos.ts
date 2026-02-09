import type { Octokit } from "octokit";
import type { Config, RepoMetaEntry } from "@mygitstats/shared";

/**
 * Discover repositories that the authenticated user has push access to.
 * Applies config-based filters (forks, archived, allowlists, blocklist).
 */
export async function discoverRepos(
  octokit: Octokit,
  config: Config
): Promise<RepoMetaEntry[]> {
  console.log("[discover] Fetching repositories...");

  const rawRepos = await octokit.paginate("GET /user/repos", {
    affiliation: "owner,collaborator,organization_member",
    per_page: 100,
  });

  console.log(`[discover] Found ${rawRepos.length} total repos from API`);

  const filtered = rawRepos.filter((repo) => {
    // Must have push permissions
    if (!repo.permissions?.push) return false;

    // Skip forks unless configured
    if (repo.fork && !config.includeForks) return false;

    // Skip archived unless configured
    if (repo.archived && !config.includeArchived) return false;

    // Org allowlist: if non-empty, only include repos from listed orgs
    if (config.orgAllowlist.length > 0) {
      const owner = repo.full_name.split("/")[0];
      if (!config.orgAllowlist.includes(owner)) return false;
    }

    // Repo allowlist: if non-empty, only include listed repos
    if (config.repoAllowlist.length > 0) {
      if (!config.repoAllowlist.includes(repo.full_name)) return false;
    }

    // Repo blocklist: skip any listed repos
    if (config.repoBlocklist.includes(repo.full_name)) return false;

    return true;
  });

  console.log(`[discover] ${filtered.length} repos after filtering`);

  return filtered.map((repo) => ({
    id: repo.id,
    fullName: repo.full_name,
    isPrivate: repo.private,
    isFork: repo.fork ?? false,
    isArchived: repo.archived ?? false,
    defaultBranch: repo.default_branch ?? "main",
    language: repo.language ?? null,
    description: repo.description ?? null,
  }));
}

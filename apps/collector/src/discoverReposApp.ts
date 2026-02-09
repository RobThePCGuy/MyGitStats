import type { Octokit } from "octokit";
import type { Config, RepoMetaEntry } from "@mygitstats/shared";
import type { MultiOwnerAuth } from "./auth.js";
import type { AuthProvider } from "@mygitstats/shared";

/** Extended entry that tracks which owner's installation token should be used. */
export interface RoutedRepoMeta extends RepoMetaEntry {
  installationOwner: string;
}

interface InstallationRepo {
  id: number;
  full_name: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  default_branch: string;
  language: string | null;
  description: string | null;
  permissions?: {
    admin?: boolean;
    push?: boolean;
    pull?: boolean;
  };
}

/**
 * Discover repos via GitHub App installation tokens.
 * Calls GET /installation/repositories for each owner, de-duplicates
 * by repo id with permission-aware resolution, and applies config filters.
 */
export async function discoverReposApp(
  auth: AuthProvider & MultiOwnerAuth,
  config: Config,
): Promise<RoutedRepoMeta[]> {
  console.log(`[discover] App mode: discovering repos for ${auth.owners().length} owner(s)`);

  // Collect all repos from all owners, tracking origin
  const seen = new Map<number, { repo: RoutedRepoMeta; hasAdmin: boolean; hasPush: boolean }>();

  for (const owner of auth.owners()) {
    const octokit = auth.octokitForOwner(owner);
    const ownerRepos = await listInstallationRepos(octokit, owner);
    console.log(`[discover] Owner "${owner}": ${ownerRepos.length} repos from installation`);

    for (const raw of ownerRepos) {
      const entry: RoutedRepoMeta = {
        id: raw.id,
        fullName: raw.full_name,
        isPrivate: raw.private,
        isFork: raw.fork ?? false,
        isArchived: raw.archived ?? false,
        defaultBranch: raw.default_branch ?? "main",
        language: raw.language ?? null,
        description: raw.description ?? null,
        installationOwner: owner,
      };

      const hasAdmin = raw.permissions?.admin ?? false;
      const hasPush = raw.permissions?.push ?? false;

      const existing = seen.get(raw.id);
      if (existing) {
        // De-duplicate: prefer stronger permissions (admin > push > first)
        const shouldReplace =
          (!existing.hasAdmin && hasAdmin) ||
          (!existing.hasAdmin && !existing.hasPush && hasPush);

        if (shouldReplace) {
          console.log(
            `[discover] Duplicate repo ${raw.full_name} (id=${raw.id}): ` +
              `replacing owner "${existing.repo.installationOwner}" with "${owner}" (stronger permissions)`
          );
          seen.set(raw.id, { repo: entry, hasAdmin, hasPush });
        } else {
          console.log(
            `[discover] Duplicate repo ${raw.full_name} (id=${raw.id}): ` +
              `keeping owner "${existing.repo.installationOwner}" over "${owner}"`
          );
        }
      } else {
        seen.set(raw.id, { repo: entry, hasAdmin, hasPush });
      }
    }
  }

  // Apply the same filters as PAT discovery
  const all = Array.from(seen.values()).map((v) => v.repo);
  const filtered = all.filter((repo) => {
    if (repo.isFork && !config.includeForks) return false;
    if (repo.isArchived && !config.includeArchived) return false;

    if (config.orgAllowlist.length > 0) {
      const owner = repo.fullName.split("/")[0];
      if (!config.orgAllowlist.includes(owner)) return false;
    }

    if (config.repoAllowlist.length > 0) {
      if (!config.repoAllowlist.includes(repo.fullName)) return false;
    }

    if (config.repoBlocklist.includes(repo.fullName)) return false;

    return true;
  });

  console.log(`[discover] ${filtered.length} repos after filtering (from ${all.length} total)`);
  return filtered;
}

async function listInstallationRepos(octokit: Octokit, owner: string): Promise<InstallationRepo[]> {
  const repos: InstallationRepo[] = [];

  try {
    const results = await octokit.paginate("GET /installation/repositories", {
      per_page: 100,
    });

    for (const repo of results) {
      repos.push(repo as unknown as InstallationRepo);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[discover] Failed to list repos for owner "${owner}": ${msg}`);
  }

  return repos;
}

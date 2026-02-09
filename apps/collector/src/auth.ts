import { Octokit } from "octokit";
import type { AuthProvider } from "@mygitstats/shared";

// ---------------------------------------------------------------------------
// Capability interface for multi-owner GitHub App auth (collector-only)
// ---------------------------------------------------------------------------

export interface MultiOwnerAuth {
  owners(): string[];
  octokitForOwner(owner: string): Octokit;
}

/** Type guard: checks both capability methods exist. */
export function isMultiOwnerAuth(
  auth: AuthProvider,
): auth is AuthProvider & MultiOwnerAuth {
  const obj = auth as unknown as Record<string, unknown>;
  return (
    typeof obj.owners === "function" &&
    typeof obj.octokitForOwner === "function"
  );
}

// ---------------------------------------------------------------------------
// Shared Octokit factory with retry/throttle
// ---------------------------------------------------------------------------

function makeOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter: number, options: Record<string, unknown>, _octokit: unknown, retryCount: number) => {
        const method = options["method"] as string;
        const url = options["url"] as string;
        console.warn(
          `[throttle] Rate limit hit for ${method} ${url} - retry after ${retryAfter}s`
        );
        return retryCount < 2;
      },
      onSecondaryRateLimit: (retryAfter: number, options: Record<string, unknown>, _octokit: unknown, retryCount: number) => {
        const method = options["method"] as string;
        const url = options["url"] as string;
        console.warn(
          `[throttle] Secondary rate limit for ${method} ${url} - retry after ${retryAfter}s`
        );
        return retryCount < 2;
      },
    },
  });
}

// ---------------------------------------------------------------------------
// ClassicPatProvider (unchanged behavior)
// ---------------------------------------------------------------------------

export class ClassicPatProvider implements AuthProvider {
  private readonly token: string;

  constructor() {
    const token = process.env.GITHUB_API_TOKEN;
    if (!token) {
      throw new Error(
        "GITHUB_API_TOKEN environment variable is required. " +
          "Create a classic PAT at https://github.com/settings/tokens"
      );
    }
    this.token = token;
  }

  createOctokit(): Octokit {
    return makeOctokit(this.token);
  }

  tokenType(): string {
    return "classic-pat";
  }
}

// ---------------------------------------------------------------------------
// GitHubAppProvider (multi-owner installation tokens)
// ---------------------------------------------------------------------------

export class GitHubAppProvider implements AuthProvider, MultiOwnerAuth {
  private readonly tokenMap: Map<string, string>;
  private readonly octokitMap: Map<string, Octokit>;
  private readonly ownerList: string[];

  constructor(tokensJson: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(tokensJson);
    } catch {
      throw new Error("GITHUB_APP_TOKENS_JSON is not valid JSON");
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("GITHUB_APP_TOKENS_JSON must be a JSON object mapping owner -> token");
    }

    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      throw new Error("GITHUB_APP_TOKENS_JSON is empty - expected at least one owner:token pair");
    }

    this.tokenMap = new Map();
    this.octokitMap = new Map();
    this.ownerList = [];

    for (const [owner, token] of entries) {
      if (!owner || typeof owner !== "string") {
        throw new Error(`GITHUB_APP_TOKENS_JSON: invalid owner key "${owner}"`);
      }
      if (!token || typeof token !== "string") {
        throw new Error(`GITHUB_APP_TOKENS_JSON: invalid token for owner "${owner}"`);
      }
      const trimmedOwner = owner.trim();
      this.tokenMap.set(trimmedOwner, token as string);
      this.octokitMap.set(trimmedOwner, makeOctokit(token as string));
      this.ownerList.push(trimmedOwner);
    }
  }

  createOctokit(): Octokit {
    // Returns the first owner's Octokit. Only use for non-owner-scoped calls
    // like rate-limit checks. Never use for repo-specific API calls in app mode.
    return this.octokitMap.get(this.ownerList[0])!;
  }

  tokenType(): string {
    return "github-app-installation";
  }

  owners(): string[] {
    return [...this.ownerList];
  }

  octokitForOwner(owner: string): Octokit {
    const ok = this.octokitMap.get(owner);
    if (!ok) {
      throw new Error(
        `No Octokit for owner "${owner}". Available owners: ${this.ownerList.join(", ")}`
      );
    }
    return ok;
  }
}

// ---------------------------------------------------------------------------
// Auto-detect auth mode from environment
// ---------------------------------------------------------------------------

export function resolveAuth(): AuthProvider {
  const appTokensJson = process.env.GITHUB_APP_TOKENS_JSON;

  // Prefer App mode if GITHUB_APP_TOKENS_JSON is set and non-empty
  if (appTokensJson && appTokensJson.trim().length > 0) {
    // Quick check: is it a non-empty object?
    try {
      const parsed = JSON.parse(appTokensJson);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
        return new GitHubAppProvider(appTokensJson);
      }
    } catch {
      // Fall through to PAT
    }
  }

  // Fall back to PAT mode
  const pat = process.env.GITHUB_API_TOKEN;
  if (pat && pat.trim().length > 0) {
    return new ClassicPatProvider();
  }

  throw new Error(
    "No authentication configured. Set one of:\n" +
      "  - GITHUB_API_TOKEN (classic PAT)\n" +
      "  - GITHUB_APP_TOKENS_JSON (GitHub App installation tokens)"
  );
}

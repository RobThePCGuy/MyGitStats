import { Octokit } from "octokit";
import type { AuthProvider } from "@mygitstats/shared";

/**
 * ClassicPatProvider - creates an Octokit instance authenticated
 * with a classic Personal Access Token from the environment.
 *
 * The `octokit` package already bundles retry, throttling, pagination,
 * and REST endpoint methods with sensible default handlers, so we
 * just need to pass the token.
 */
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
    return new Octokit({
      auth: this.token,
      throttle: {
        onRateLimit: (retryAfter: number, options: Record<string, unknown>, _octokit: unknown, retryCount: number) => {
          const method = options["method"] as string;
          const url = options["url"] as string;
          console.warn(
            `[throttle] Rate limit hit for ${method} ${url} - retry after ${retryAfter}s`
          );
          // Retry twice
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

  tokenType(): string {
    return "classic-pat";
  }
}

/**
 * AuthProvider interface -- abstracts over PAT types.
 * Classic PAT for v1; fine-grained PAT can implement the same interface later.
 *
 * Uses a generic return type to avoid coupling shared package to octokit.
 * The collector will narrow this to the concrete Octokit type.
 */
export interface AuthProvider {
  /** Create an authenticated Octokit instance. */
  createOctokit(): unknown;

  /** Return the token type for diagnostics. */
  tokenType(): string;
}

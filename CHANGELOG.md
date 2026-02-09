# Changelog

## v2.0.0

### Added

- **GitHub App authentication** -- multi-owner installation token flow as an alternative to classic PATs. Configure via `APP_ID`, `APP_PRIVATE_KEY` secrets and `appOwners` in config.
- **Multi-org support** -- install the GitHub App on multiple accounts/orgs and collect data across all of them with automatic per-repo permission-aware deduplication.
- **Workflow guardrails** -- the Actions workflow now validates auth configuration before running, with clear error annotations for misconfiguration (e.g. App secrets set but `appOwners` empty).
- **Meta file allowlist** -- `prepare-data` fails the build if unknown JSON files appear in `data/meta/`, preventing accidental publication of internal files like `routing.json`.
- **Test suite** -- vitest-based tests for JWT token minting, Link header parsing, repo dedup logic, and meta file allowlist.
- **README** -- setup guides for both PAT and App modes, configuration reference, support matrix, troubleshooting table, and security notes.
- **CHANGELOG** -- this file.

### Changed

- PAT mode (`GITHUB_API_TOKEN`) remains fully supported and is the default when App secrets are not configured.
- `routing.json` (App mode repo-to-owner mapping) is written to `data/meta/` but explicitly blocked from dashboard publication.

### Notes

- Contributions (commit heatmap) are only available in PAT mode due to GitHub API limitations -- App installation tokens cannot access the user contributions GraphQL endpoint.

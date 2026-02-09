# v2.0 Design: GitHub App Authentication

## Context

v1 uses a Classic Personal Access Token (PAT) for all GitHub API access. This works for a single user but has friction for sharing: every user must create and manage a long-lived PAT with broad `repo` scope. v2.0 adds GitHub App installation token auth as an alternative, keeping PAT as a supported path.

## Scope

**v2.0 (this design):** GitHub App installation token auth + multi-owner discovery, distributed as a template repo. Self-hosted on GitHub Actions + Pages. No backend.

**Not in scope:** User access tokens for global contribution stats (v2.1), hosted multi-user service (v2.2).

## Auth Layer

### Capability-based design

The shared `AuthProvider` interface stays unchanged (`createOctokit(): unknown`, `tokenType(): string`).

In the collector, add a capability interface and type guard:

```typescript
// apps/collector/src/auth.ts (collector-only, not in shared)

interface MultiOwnerAuth {
  owners(): string[];
  octokitForOwner(owner: string): Octokit;
}

function isMultiOwnerAuth(auth: AuthProvider): auth is AuthProvider & MultiOwnerAuth {
  return (
    typeof (auth as any).owners === "function" &&
    typeof (auth as any).octokitForOwner === "function"
  );
}
```

### Providers

**ClassicPatProvider** -- unchanged. Single Octokit, `tokenType()` = `"classic-pat"`.

**GitHubAppProvider** -- new, implements `AuthProvider & MultiOwnerAuth`:
- Parses and validates `GITHUB_APP_TOKENS_JSON` (must be object, non-empty keys, non-empty string values, at least one owner)
- Creates one Octokit per owner with retry/throttle (same config as PAT provider)
- `createOctokit()` returns first owner's Octokit -- only used for rate-limit checks, never for owner-scoped calls
- `tokenType()` = `"github-app-installation"`

### Auth resolution

`resolveAuth()` auto-detects from env vars, App-preferred:
1. `GITHUB_APP_TOKENS_JSON` set and parses to non-empty object -> `GitHubAppProvider`
2. `GITHUB_API_TOKEN` set and non-empty -> `ClassicPatProvider`
3. Neither -> fail fast with clear error listing required env vars

No `authMode` field in config. Auth mode is driven entirely by which env vars/secrets exist.

## Discovery

### Dual strategy

- **PAT mode:** Keep existing `discoverReposPat()` using `GET /user/repos` with affiliation filtering
- **App mode:** New `discoverReposApp()`:
  - Loops `auth.owners()`
  - Calls `GET /installation/repositories` with pagination per owner
  - Tags each repo with `installationOwner` (collector-internal, not in shared schema)
  - De-duplicates by repo `id` with permission-aware resolution:
    - Prefer the entry where `permissions.admin` is true (required for traffic endpoints)
    - Else prefer `permissions.push`
    - Else keep first seen
    - Log all duplicates with selected owner and reason
  - Applies same filters as PAT mode: forks, archived, allowlists, blocklists

### Routing metadata

Collector writes `data/meta/routing.json` in App mode:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-02-08T06:00:00Z",
  "repoIdToOwner": {
    "123456": "myuser",
    "789012": "myorg1"
  }
}
```

This file is collector-only. `prepare-data` never reads it. Dashboard never sees it. Add an explicit allowlist in `prepare-data` for meta files to prevent accidental leakage.

Schema lives in collector (`RoutingFileSchema`), not in shared.

## Collection Routing

### Orchestrator changes (index.ts)

```
auth = resolveAuth()

// Discovery
repos = isMultiOwnerAuth(auth)
  ? discoverReposApp(auth, config)
  : discoverReposPat(auth.createOctokit(), config)

// Traffic -- route through correct Octokit per repo
for each repo:
  octokit = isMultiOwnerAuth(auth)
    ? auth.octokitForOwner(repo.installationOwner)  // hard error if missing
    : auth.createOctokit()
  fetchTraffic(octokit, repo)

// Snapshots -- batch by owner in App mode
if isMultiOwnerAuth(auth):
  group repos by installationOwner
  for each group: fetchRepoSnapshots(auth.octokitForOwner(owner), groupRepos)
else:
  fetchRepoSnapshots(auth.createOctokit(), repos)

// Contributions -- PAT only
if auth.tokenType() === "classic-pat":
  fetchContributions(auth.createOctokit(), from, to)
else:
  log "Contributions skipped (requires PAT auth mode)"
```

Missing `installationOwner` in App mode = hard error per repo (skip with loud log, never a non-null assertion).

## Workflow Token Minting

### New script: `scripts/mint-app-tokens.ts`

Single TypeScript script that:
1. Reads `APP_ID` and `APP_PRIVATE_KEY` from env
2. Reads `appOwners` from `mygitstats.config.json`
3. Signs a JWT (RS256) using Node `crypto.createSign()`:
   - `iss` = APP_ID
   - `iat` = now - 60 seconds (clock drift tolerance)
   - `exp` = now + 10 minutes (GitHub maximum)
4. Calls `GET /app/installations` with Link-header pagination
5. Matches installations to owners by `account.login`
6. For each matched installation: `POST /app/installations/{id}/access_tokens`
7. Masks each token (`::add-mask::`) before any output
8. Writes `tokens_json={"owner1":"ghs_xxx","owner2":"ghs_yyy"}` to `$GITHUB_OUTPUT`
9. Fails fast if any owner from config has no matching installation

No external dependencies -- uses Node built-in `crypto` and `fetch`.

### Workflow changes

```yaml
- name: Mint GitHub App installation tokens
  id: app_tokens
  if: ${{ secrets.APP_ID != '' && secrets.APP_PRIVATE_KEY != '' }}
  env:
    APP_ID: ${{ secrets.APP_ID }}
    APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}
  run: npx tsx scripts/mint-app-tokens.ts

- name: Collect
  run: pnpm collect
  env:
    GITHUB_API_TOKEN: ${{ secrets.GITHUB_API_TOKEN }}
    GITHUB_APP_TOKENS_JSON: ${{ steps.app_tokens.outputs.tokens_json }}
```

PAT users see no change -- if `APP_ID` secret doesn't exist, minting step is skipped, `GITHUB_APP_TOKENS_JSON` is empty, `resolveAuth()` falls through to PAT mode.

Tokens are short-lived (1 hour) by design. No manual revocation needed.

## Config + Schema Changes

### Config (`mygitstats.config.json`)

Add one optional field:

```json
{
  "appOwners": ["myuser", "myorg1"]
}
```

Default: `[]`. Only used in App mode. Ignored in PAT mode.

### Shared schema (`packages/shared/src/schema.ts`)

- `ConfigSchema`: add `appOwners: z.array(z.string()).default([])`
- `LastRunSchema`: add `authMode: z.enum(["pat", "app"]).optional()` for diagnostics
- No changes to `DailyFileSchema`, `RepoMetaEntrySchema`, `WindowFileSchema`

### Dashboard changes (minimal)

- Contributions empty state: when `contributions.days` is empty, show "Contributions data not available (requires PAT auth mode)" instead of empty chart
- Surface `authMode` from last-run metadata if displayed
- `prepare-data.ts`: add explicit allowlist for meta files to prevent publishing routing.json or other internal artifacts

## File Inventory

### New files (3)

| File | Purpose |
|------|---------|
| `scripts/mint-app-tokens.ts` | Mint installation tokens per owner in Actions |
| `apps/collector/src/discoverReposApp.ts` | App-mode discovery via `/installation/repositories` |
| `apps/collector/src/routing.ts` | RoutingFile schema + read/write helpers |

### Modified files (9)

| File | Changes |
|------|---------|
| `apps/collector/src/auth.ts` | Add `MultiOwnerAuth` interface, `GitHubAppProvider`, `resolveAuth()`, type guard |
| `apps/collector/src/discoverRepos.ts` | Rename main export to `discoverReposPat()` |
| `apps/collector/src/index.ts` | Use `resolveAuth()`, branch discovery, route traffic/snapshots by owner, gate contributions |
| `apps/collector/src/fetchRepoSnapshots.ts` | Accept Octokit + repo list so orchestrator can call per owner group |
| `packages/shared/src/schema.ts` | Add `appOwners` to ConfigSchema, `authMode` to LastRunSchema |
| `mygitstats.config.json` | Add `appOwners: []` |
| `.github/workflows/collect-and-deploy.yml` | Add minting step, pass `GITHUB_APP_TOKENS_JSON` |
| `apps/dashboard/src/pages/Overview.tsx` | Contributions empty state for App mode |
| `apps/dashboard/src/lib/prepare-data.ts` | Meta file allowlist to prevent routing.json leakage |

### Generated artifacts (1)

| File | Purpose |
|------|---------|
| `data/meta/routing.json` | Collector-only repoId -> owner mapping (App mode only) |

## Milestones

### Milestone A: Auth mode plumbing
- `GitHubAppProvider` + `MultiOwnerAuth` + type guard
- `resolveAuth()` env auto-detect, App preferred
- `index.ts` gates contributions by PAT mode only
- **Verify:** PAT mode unchanged; set fake `GITHUB_APP_TOKENS_JSON` and confirm mode selection + diagnostic logging

### Milestone B: App discovery + routing metadata
- `discoverReposApp()` using `/installation/repositories` per owner
- Permission-aware de-duplication (admin > push > first)
- Write `data/meta/routing.json`
- **Verify:** With real installation tokens, repos match installation selection, routing file correct, duplicates logged

### Milestone C: Collection routing (traffic + snapshots)
- Traffic calls use `octokitForOwner(owner)` in App mode
- Snapshot GraphQL batched by owner group
- Hard error per repo if routing missing in App mode
- **Verify:** App mode run completes without cross-owner errors, daily/window files written

### Milestone D: Workflow token minting
- `scripts/mint-app-tokens.ts` with JWT signing, pagination, masking, GITHUB_OUTPUT
- Workflow step conditioned on both `APP_ID` and `APP_PRIVATE_KEY` secrets
- **Verify:** Manual workflow run mints tokens, collector auto-selects App mode, missing installation fails fast

### Milestone E: Config + dashboard UX
- `appOwners` in ConfigSchema with default `[]`
- `authMode` in last-run metadata
- Dashboard contributions empty state for App mode
- Meta file allowlist in `prepare-data`
- **Verify:** Dashboard builds and renders with contributions absent, no runtime errors

## Secrets Required (App Mode)

| Secret | Description |
|--------|-------------|
| `APP_ID` | GitHub App numeric ID |
| `APP_PRIVATE_KEY` | GitHub App PEM private key |

PAT mode continues to use `GITHUB_API_TOKEN` only.

## GitHub App Required Permissions

| Permission | Access | Why |
|------------|--------|-----|
| Repository: Administration | Read | Required for traffic endpoints |
| Repository: Metadata | Read | Required for repo listing (granted by default) |

## Constraints and Caveats

- A GitHub App must be installed separately on each owner (personal account and each org). This is a GitHub platform constraint.
- Installation tokens are scoped to one installation (one owner). Multi-owner requires multiple tokens.
- Contributions (`contributionsCollection` GraphQL) require a user-scoped token. App installation tokens cannot access this. Contributions are PAT-only in v2.0.
- Installation tokens expire after 1 hour. The minting script runs at the start of each workflow, so this is not a practical concern for typical collection runs.

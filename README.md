# MyGitStats

A self-hosted GitHub analytics dashboard. MyGitStats collects traffic data (views, clones, referrers), star/fork counts, and contribution history for your repositories using GitHub Actions, stores everything as JSON in your own repo, and builds a static dashboard you can host on GitHub Pages. Your data stays under your control -- no third-party services required.

## Quick Start (PAT Mode)

The simplest setup uses a classic Personal Access Token.

1. **Fork or use this repo as a template**
2. **Create a classic PAT** at <https://github.com/settings/tokens> with the `repo` and `read:org` scopes
3. **Add the secret** in your fork: Settings > Secrets and variables > Actions > New repository secret
   - Name: `GITHUB_API_TOKEN`
   - Value: your PAT
4. **Enable GitHub Pages**: Settings > Pages > Source: GitHub Actions
5. **Trigger the workflow**: Actions > "Collect and Deploy" > Run workflow

The workflow runs daily at 06:00 UTC. After the first run, your dashboard will be live at `https://<username>.github.io/<repo>/`.

## Quick Start (GitHub App Mode)

GitHub App mode supports collecting data across multiple accounts/orgs and avoids the broad `repo` scope of a PAT.

1. **Create a GitHub App** at <https://github.com/settings/apps/new>
   - Homepage URL: your repo URL
   - Permissions: Repository metadata (read), Repository administration (read)
   - Webhook: uncheck "Active" (not needed)
   - Where can this app be installed: "Only on this account" (or "Any account" for cross-org)
2. **Install the app** on your account and/or any orgs you want to collect data from
3. **Add secrets** in your repo:
   - `APP_ID` -- the App ID from your app's settings page
   - `APP_PRIVATE_KEY` -- generate and download a private key from the app settings, paste the full PEM contents
4. **Update `mygitstats.config.json`** -- add every GitHub account/org login where the app is installed:
   ```json
   {
     "appOwners": ["your-username", "your-org"]
   }
   ```
5. **Enable GitHub Pages** and **trigger the workflow** (same as PAT mode above)

Both auth modes can coexist. If `APP_ID` and `APP_PRIVATE_KEY` secrets are set and `appOwners` is non-empty, App mode is used. Otherwise it falls back to the PAT.

## First Run Checklist

After following one of the Quick Start guides above:

- [ ] Repo created (forked or from template)
- [ ] Auth secrets added (`GITHUB_API_TOKEN` for PAT, or `APP_ID` + `APP_PRIVATE_KEY` for App)
- [ ] `mygitstats.config.json` updated (add `appOwners` if using App mode)
- [ ] GitHub Pages enabled (Settings > Pages > Source: GitHub Actions)
- [ ] Run `workflow_dispatch` once from the Actions tab to kick off the first collection

After the workflow completes, `data/` will contain your first snapshot and the dashboard will deploy to Pages. Subsequent runs happen automatically every day at 06:00 UTC.

## Support Matrix

| Feature | PAT Mode | App Mode |
|---|---|---|
| Traffic (views, clones) | Yes | Yes |
| Snapshots (stars, forks) | Yes | Yes |
| Contributions (commit heatmap) | Yes | No -- requires a user-scoped token |
| Referrers & popular paths | Yes | Yes |
| Private repo collection | Yes | Yes |
| Private repo on dashboard | Opt-in via `publishPrivateRepos` | Opt-in via `publishPrivateRepos` |
| Multi-org collection | No -- single token | Yes -- one installation per org |

## Configuration Reference

All configuration lives in `mygitstats.config.json` at the project root.

| Field | Type | Default | Description |
|---|---|---|---|
| `includeForks` | `boolean` | `false` | Include forked repositories in collection |
| `includeArchived` | `boolean` | `false` | Include archived repositories |
| `orgAllowlist` | `string[]` | `[]` | Only collect repos owned by these orgs/users (empty = all) |
| `repoAllowlist` | `string[]` | `[]` | Only collect these specific repos by `owner/name` (empty = all) |
| `repoBlocklist` | `string[]` | `[]` | Never collect these repos by `owner/name` |
| `maxConcurrency` | `number` | `5` | Max parallel API calls during collection (1-20) |
| `publishPrivateRepos` | `string[]` | `[]` | Private repos whose stats should appear on the public dashboard |
| `appOwners` | `string[]` | `[]` | GitHub account/org logins where the App is installed (App mode only) |

## How It Works

1. **Collect** -- A GitHub Actions workflow (`collect-and-deploy.yml`) runs daily. The collector fetches traffic stats, star/fork counts, contribution history, and referrer data via the GitHub API, then writes the results as dated JSON files under `data/`.
2. **Commit** -- The workflow commits any new or updated data files back to the repo.
3. **Build** -- The dashboard app reads from `data/`, transforms it into a set of optimized JSON files, and builds a static React site with Vite.
4. **Deploy** -- The built site is uploaded to GitHub Pages.

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| 403 on traffic endpoints | PAT missing `repo` scope, or App missing administration read permission | Re-create the PAT with `repo` + `read:org`, or update App permissions |
| No contributions in App mode | Contribution data requires a user-scoped token | Contributions are only collected in PAT mode; this is a GitHub API limitation |
| Empty dashboard after first run | The `data/` directory has no JSON files yet | Trigger the workflow manually and wait for it to complete |
| Rate limiting (403/429) | Too many repos or too-frequent runs | Lower `maxConcurrency`, or add repos to `repoBlocklist` |
| `routing.json` published | Should never happen | `prepare-data` has an allowlist that blocks internal meta files from the dashboard build |

## Security Notes

- **PAT scope**: A classic PAT with `repo` scope has full read/write access to all your repositories. Keep the token secret and rotate it periodically.
- **Private repos**: By default, private repo stats are excluded from the published dashboard. Only repos explicitly listed in `publishPrivateRepos` will appear.
- **No secrets in published data**: The dashboard build pipeline never copies tokens, keys, or `routing.json` into the published output.
- **GitHub Pages**: The dashboard is a static site with no server-side code. All data is pre-built JSON.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck

# Run tests
pnpm test

# Start dashboard dev server
pnpm dev

# Run the collector locally (requires auth env vars)
pnpm collect

# Validate data files
pnpm verify-data
```

### Project Structure

```
mygitstats/
  apps/
    collector/    -- GitHub API data collection
    dashboard/    -- React + Vite static dashboard
  packages/
    shared/       -- Zod schemas and shared types
  scripts/        -- Standalone scripts (token minting, data verification)
  data/           -- Collected JSON data (committed by CI)
```

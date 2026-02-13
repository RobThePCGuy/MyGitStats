# MyGitStats

Your GitHub stats, on your terms. MyGitStats is a self-hosted analytics dashboard that tracks traffic (views, clones, referrers), stars, forks, and contributions across all your repositories. It runs as a GitHub Actions workflow, stores data as JSON files in your repo, and publishes a static dashboard to GitHub Pages.

No third-party services. No tracking. Your data never leaves your GitHub account.

<!-- TODO: Add a screenshot of the dashboard here once you have one.
![Dashboard screenshot](docs/screenshot.png)
-->

---

## How to Use This Template

1. Click **"Use this template"** (green button, top right) to create your own copy.
2. Choose a name for your new repo and set it to **Private** or **Public**.
3. Follow **one** of the two setup guides below.

> **GitHub Pages and private repos:** GitHub Pages is free for public repos on all plans. If you want your repo to be private, you need **GitHub Pro**, **Team**, or **Enterprise** -- otherwise the dashboard deploy step will fail. If you are on the free plan, make your repo public.

> **First run:** This template ships with empty `data/` directories and the dashboard will be blank until your first workflow run completes. After setup, trigger the workflow manually -- your dashboard will be live within about a minute. From that point on, data is collected automatically every day at 06:00 UTC.

---

## Setup Option A: Personal Access Token (Simplest)

A classic PAT is the fastest way to get started. It covers all features including contribution history.

### Step 1: Create a PAT

Go to [github.com/settings/tokens](https://github.com/settings/tokens) and create a **classic** token.

Choose scopes based on what you want to collect:

| What you want | Required scope(s) |
|---|---|
| Public repos | `public_repo` |
| Public repos & organizations | `public_repo` + `read:org` |
| Private repos | `repo` |

> **Choose the least access you need.** For public-only collection, start with `public_repo` and add `read:org` only if org repos are missing.
>
> **Privacy reminder:** private repo stats are hidden by default, but if you add repos to `publishPrivateRepos`, their metrics become visible on your published dashboard.

### Step 2: Add the secret to your repo

In your new repo, go to **Settings > Secrets and variables > Actions > New repository secret**:

| Secret name | Value |
|---|---|
| `GH_PAT` | The token you just created |

> **Your token is stored as an encrypted GitHub Actions secret.** It is never written to files, never logged, and never included in the published dashboard. Only the GitHub Actions runner can read it, and only during workflow execution.

### Step 3: Enable GitHub Pages

Go to **Settings > Pages** and set **Source** to **GitHub Actions**.

### Step 4: Run the workflow

Go to **Actions > "Collect and Deploy" > Run workflow**. After it finishes (about 1 minute), your dashboard will be live at:

```
https://<your-username>.github.io/<your-repo-name>/
```

The workflow runs automatically every day at 06:00 UTC from that point on.

---

## Setup Option B: GitHub App (Multi-Org, Narrower Permissions)

A GitHub App avoids the broad `repo` scope of a PAT and lets you collect data from multiple GitHub accounts or organizations.

### Step 1: Create a GitHub App

Go to [github.com/settings/apps/new](https://github.com/settings/apps/new) and fill in:

| Setting | Value |
|---|---|
| App name | Anything (e.g. `mygitstats-<your-username>`) |
| Homepage URL | Your repo URL |
| Webhook | Uncheck "Active" |
| Permissions | Repository metadata: **Read**, Administration: **Read**, Issues: **Read**, Pull requests: **Read** |
| Install scope | "Only on this account" (or "Any account" for cross-org) |

### Step 2: Install the app

After creating the app, click **Install App** in the sidebar. Install it on your personal account and on any organizations you want to collect data from.

### Step 3: Add secrets to your repo

From your app's settings page, note the **App ID** and generate a **private key** (downloads a `.pem` file).

In your repo, go to **Settings > Secrets and variables > Actions** and add:

| Secret name | Value |
|---|---|
| `APP_ID` | The numeric App ID from your app's settings |
| `APP_PRIVATE_KEY` | The full contents of the `.pem` file |

> **After pasting the private key into the secret, delete the `.pem` file from your computer.** The key only needs to live in GitHub's encrypted secret storage. Never commit `.pem` files to any repository -- this repo's `.gitignore` blocks them, but it is best to remove the file entirely.

### Step 4: Configure appOwners

Edit `mygitstats.config.json` in your repo and list every GitHub account/org where you installed the app:

```json
{
  "appOwners": ["your-username", "your-org"]
}
```

Commit and push this change.

### Step 5: Enable Pages and run the workflow

Same as PAT mode: **Settings > Pages > Source: GitHub Actions**, then **Actions > "Collect and Deploy" > Run workflow**.

> **Note:** If you set `APP_ID` and `APP_PRIVATE_KEY` but forget to add entries to `appOwners`, the workflow will fail immediately with a clear error message telling you what to fix.

---

## What Each Mode Supports

| Feature | PAT | App |
|---|---|---|
| Traffic (views, clones) | Yes | Yes |
| Snapshots (stars, forks) | Yes | Yes |
| Contributions (commit heatmap) | Yes | No* |
| Referrers and popular paths | Yes | Yes |
| Private repo collection | Yes | Yes |
| Private repo stats on dashboard | Opt-in | Opt-in |
| Multi-org collection | No | Yes |

*Contributions require a user-scoped token. This is a GitHub API limitation, not a MyGitStats limitation.

If both PAT and App secrets are configured, App mode takes priority.

---

## Configuration

All settings live in `mygitstats.config.json` at the root of your repo.

| Field | Type | Default | What it does |
|---|---|---|---|
| `includeForks` | boolean | `false` | Collect stats for forked repos |
| `includeArchived` | boolean | `false` | Collect stats for archived repos |
| `orgAllowlist` | string[] | `[]` | Only collect from these orgs/users (empty means all) |
| `repoAllowlist` | string[] | `[]` | Only collect these specific `owner/repo` names (empty means all) |
| `repoBlocklist` | string[] | `[]` | Never collect these `owner/repo` names |
| `maxConcurrency` | number | `5` | Parallel API calls during collection (1-20) |
| `publishPrivateRepos` | string[] | `[]` | Private repos to include on the public dashboard |
| `appOwners` | string[] | `[]` | GitHub accounts/orgs where your App is installed |

---

## How It Works

```
  Schedule (daily 06:00 UTC) or manual trigger
                    |
                    v
          +------------------+
          |  1. Collect data |  GitHub Actions calls the GitHub API
          |     via API      |  using your PAT or App token
          +------------------+
                    |
                    v
          +------------------+
          |  2. Commit JSON  |  Results saved to data/ and pushed
          |     to data/     |  back to your repo
          +------------------+
                    |
                    v
          +------------------+
          |  3. Build static |  React + Vite dashboard reads data/
          |     dashboard    |  and produces optimized HTML/JS/CSS
          +------------------+
                    |
                    v
          +------------------+
          |  4. Deploy to    |  Static site uploaded to GitHub Pages
          |     GitHub Pages |
          +------------------+
```

No servers to maintain. No databases. Just JSON files and a static site.

---

## Keeping Your Data Safe

This section explains what happens with your tokens and data. Read this before setting up.

**Your secrets are never exposed:**
- `GH_PAT`, `APP_ID`, and `APP_PRIVATE_KEY` are stored as [GitHub Actions encrypted secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions). They are injected as environment variables at runtime and automatically masked in logs.
- The workflow never writes tokens to files or includes them in commits.
- The dashboard build pipeline explicitly blocks internal files (like `routing.json`) from the published output.
- A built-in **Security Scan** workflow runs [gitleaks](https://github.com/gitleaks/gitleaks) on pushes and pull requests to catch accidental secret commits early.

**Your private repos are protected by default:**
- Stats for private repos are collected (so you don't lose data), but they are **excluded from the published dashboard** unless you explicitly add them to `publishPrivateRepos` in the config.
- If your dashboard repo is public, anyone can see the published stats. Only add repos to `publishPrivateRepos` if you are comfortable with that.

**Files that `.gitignore` blocks:**
- `*.pem`, `*.key`, `*.p12`, `*.pfx` -- private key files
- `.env`, `.env.*` -- environment variable files
- `apps/dashboard/public/data/` -- build output (regenerated on every deploy)

**What to do if you accidentally commit a secret:**
1. Rotate the token or key immediately (revoke the old one, create a new one).
2. Update the GitHub Actions secret with the new value.
3. Treat the old value as compromised regardless of whether you force-push to remove it -- GitHub may have cached it.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| 403 on traffic endpoints | PAT/App token lacks required repo permission, or account lacks push/write on the repo | PAT mode: use `public_repo` for public-only or `repo` for private repos; add `read:org` if org discovery is needed. App mode: ensure **Administration: Read** is granted and app is installed on that repo |
| No contributions in App mode | GitHub API limitation | Contributions only work with PAT mode; switch to PAT or accept the gap |
| Empty dashboard | No data collected yet | Trigger the workflow manually and wait for it to finish |
| Rate limiting (403/429) | Too many repos or API calls | Lower `maxConcurrency` in config, or add large repos to `repoBlocklist` |
| Workflow fails: "appOwners is empty" | App secrets set but config not updated | Add your GitHub username/orgs to `appOwners` in `mygitstats.config.json` |
| Workflow fails: "No installation found" | App not installed on the listed account/org | Go to your App's settings page and install it on the missing account |

---

## Development

For contributors or anyone who wants to run things locally:

```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm typecheck      # Type-check all packages
pnpm test           # Run test suite
pnpm dev            # Start dashboard dev server (hot reload)
pnpm collect        # Run collector locally (needs GH_PAT env var)
pnpm verify-data    # Validate data/ files against schemas
```

### Project Structure

```
mygitstats/
  apps/
    collector/    -- Fetches data from GitHub API
    dashboard/    -- React + Vite static dashboard
  packages/
    shared/       -- Zod schemas and TypeScript types
  scripts/        -- Token minting, data verification
  data/           -- Collected JSON (committed by CI)
```

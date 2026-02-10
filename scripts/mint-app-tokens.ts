#!/usr/bin/env node
/* eslint-disable no-console */

import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildJwt, parseLinkHeader } from "./mint-app-tokens-lib.js";

type Installation = {
  id: number;
  account: { login: string };
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function ghFetch(url: string, jwt: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

async function listInstallations(jwt: string): Promise<Installation[]> {
  const out: Installation[] = [];
  let url = "https://api.github.com/app/installations?per_page=100";

  while (url) {
    const res = await ghFetch(url, jwt);
    if (!res.ok) {
      throw new Error(
        `GET /app/installations failed: ${res.status} ${res.statusText}. Check App permissions and installation scope.`,
      );
    }
    const page = (await res.json()) as Installation[];
    out.push(...page);

    const links = parseLinkHeader(res.headers.get("link"));
    url = links.next ?? "";
  }

  return out;
}

async function mintInstallationToken(jwt: string, installationId: number): Promise<string> {
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
  const res = await ghFetch(url, jwt, { method: "POST", body: "{}" });

  if (!res.ok) {
    throw new Error(
      `POST /app/installations/${installationId}/access_tokens failed: ${res.status} ${res.statusText}. Check App permissions for that installation.`
    );
  }

  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error(`No token returned for installation ${installationId}`);
  return json.token;
}

function readAppOwnersFromConfig(): string[] {
  const configPath = resolve(process.cwd(), "mygitstats.config.json");
  const raw = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as { appOwners?: unknown };
  const owners = Array.isArray(parsed.appOwners) ? parsed.appOwners : [];
  const clean = owners
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  return clean;
}

function writeStepOutput(name: string, value: string): void {
  const outPath = process.env.GITHUB_OUTPUT;
  if (!outPath) throw new Error("GITHUB_OUTPUT not set (this script is meant to run in GitHub Actions)");
  appendFileSync(outPath, `${name}=${value}\n`, "utf8");
}

async function main(): Promise<void> {
  const appId = requireEnv("APP_ID");
  let privateKeyPem = requireEnv("APP_PRIVATE_KEY");

  // Secrets often store newlines as \n
  privateKeyPem = privateKeyPem.includes("\\n") ? privateKeyPem.replace(/\\n/g, "\n") : privateKeyPem;

  const owners = readAppOwnersFromConfig();
  if (owners.length === 0) {
    throw new Error("App mode enabled, but mygitstats.config.json has no appOwners");
  }

  const jwt = buildJwt(appId, privateKeyPem);
  const installations = await listInstallations(jwt);

  const byLogin = new Map<string, Installation>();
  for (const inst of installations) {
    byLogin.set(inst.account.login.toLowerCase(), inst);
  }

  const tokensByOwner: Record<string, string> = {};
  for (const owner of owners) {
    const inst = byLogin.get(owner);
    if (!inst) throw new Error(`No installation found for owner "${owner}". Did you install the app there?`);
    const token = await mintInstallationToken(jwt, inst.id);

    // Mask before anything could ever print it
    console.log(`::add-mask::${token}`);
    tokensByOwner[owner] = token;
  }

  const json = JSON.stringify(tokensByOwner);
  writeStepOutput("tokens_json", json);
}

main().catch((err) => {
  console.error(String(err?.stack ?? err));
  process.exit(1);
});

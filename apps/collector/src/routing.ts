import { dataDir, readJSON, writeJSON } from "./fileio.js";
import * as path from "node:path";

export interface RoutingFile {
  schemaVersion: 1;
  generatedAt: string;
  repoIdToOwner: Record<string, string>;
}

export function routingPath(): string {
  return path.join(dataDir(), "meta", "routing.json");
}

export async function readRoutingFile(): Promise<RoutingFile | null> {
  return readJSON<RoutingFile>(routingPath());
}

export async function writeRoutingFile(repoIdToOwner: Record<string, string>): Promise<void> {
  const data: RoutingFile = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repoIdToOwner,
  };
  await writeJSON(routingPath(), data);
  console.log(`[routing] Wrote routing.json (${Object.keys(repoIdToOwner).length} repos)`);
}

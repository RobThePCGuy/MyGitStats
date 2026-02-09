/** Meta files that are safe to publish to the dashboard. */
export const ALLOWED_META_FILES = new Set(["repos.json", "last-run.json"]);

/** Internal meta files the collector produces that must never be published. */
export const KNOWN_INTERNAL_META_FILES = new Set(["routing.json"]);

/** All recognized meta file names (published + internal). */
export function isKnownMetaFile(name: string): boolean {
  return ALLOWED_META_FILES.has(name) || KNOWN_INTERNAL_META_FILES.has(name);
}

/** Check whether a meta file name is in the publish allowlist. */
export function isAllowedMetaFile(name: string): boolean {
  return ALLOWED_META_FILES.has(name);
}

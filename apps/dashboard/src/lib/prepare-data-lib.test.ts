import { describe, it, expect } from "vitest";
import {
  ALLOWED_META_FILES,
  KNOWN_INTERNAL_META_FILES,
  isAllowedMetaFile,
  isKnownMetaFile,
} from "./prepare-data-lib.js";

describe("isAllowedMetaFile", () => {
  it("allows repos.json", () => {
    expect(isAllowedMetaFile("repos.json")).toBe(true);
  });

  it("allows last-run.json", () => {
    expect(isAllowedMetaFile("last-run.json")).toBe(true);
  });

  it("blocks routing.json", () => {
    expect(isAllowedMetaFile("routing.json")).toBe(false);
  });

  it("blocks non-JSON files", () => {
    expect(isAllowedMetaFile("repos.txt")).toBe(false);
    expect(isAllowedMetaFile("data.csv")).toBe(false);
  });

  it("uses exact set membership (no substring matching)", () => {
    expect(isAllowedMetaFile("repos.json.bak")).toBe(false);
    expect(isAllowedMetaFile("old-repos.json")).toBe(false);
    expect(isAllowedMetaFile("last-run.json.tmp")).toBe(false);
  });

  it("ALLOWED_META_FILES contains exactly the expected entries", () => {
    expect(ALLOWED_META_FILES.size).toBe(2);
    expect(ALLOWED_META_FILES.has("repos.json")).toBe(true);
    expect(ALLOWED_META_FILES.has("last-run.json")).toBe(true);
  });
});

describe("isKnownMetaFile", () => {
  it("recognizes published files as known", () => {
    expect(isKnownMetaFile("repos.json")).toBe(true);
    expect(isKnownMetaFile("last-run.json")).toBe(true);
  });

  it("recognizes internal files as known", () => {
    expect(isKnownMetaFile("routing.json")).toBe(true);
  });

  it("rejects truly unknown files", () => {
    expect(isKnownMetaFile("secrets.json")).toBe(false);
    expect(isKnownMetaFile("debug-dump.json")).toBe(false);
  });

  it("KNOWN_INTERNAL_META_FILES contains routing.json", () => {
    expect(KNOWN_INTERNAL_META_FILES.size).toBe(1);
    expect(KNOWN_INTERNAL_META_FILES.has("routing.json")).toBe(true);
  });
});

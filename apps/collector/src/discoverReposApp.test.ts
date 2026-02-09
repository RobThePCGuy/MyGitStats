import { describe, it, expect } from "vitest";
import { shouldReplaceEntry } from "./discoverReposApp.js";

describe("shouldReplaceEntry (dedup logic)", () => {
  it("admin incoming replaces push-only existing", () => {
    const existing = { hasAdmin: false, hasPush: true };
    const incoming = { hasAdmin: true, hasPush: true };
    expect(shouldReplaceEntry(existing, incoming)).toBe(true);
  });

  it("admin incoming replaces pull-only existing", () => {
    const existing = { hasAdmin: false, hasPush: false };
    const incoming = { hasAdmin: true, hasPush: false };
    expect(shouldReplaceEntry(existing, incoming)).toBe(true);
  });

  it("push incoming replaces pull-only existing (no admin on either)", () => {
    const existing = { hasAdmin: false, hasPush: false };
    const incoming = { hasAdmin: false, hasPush: true };
    expect(shouldReplaceEntry(existing, incoming)).toBe(true);
  });

  it("push incoming does NOT replace admin existing", () => {
    const existing = { hasAdmin: true, hasPush: true };
    const incoming = { hasAdmin: false, hasPush: true };
    expect(shouldReplaceEntry(existing, incoming)).toBe(false);
  });

  it("equal permissions (both push): first-seen wins (stable)", () => {
    const existing = { hasAdmin: false, hasPush: true };
    const incoming = { hasAdmin: false, hasPush: true };
    expect(shouldReplaceEntry(existing, incoming)).toBe(false);
  });

  it("equal permissions (both admin): first-seen wins (stable)", () => {
    const existing = { hasAdmin: true, hasPush: true };
    const incoming = { hasAdmin: true, hasPush: true };
    expect(shouldReplaceEntry(existing, incoming)).toBe(false);
  });

  it("equal permissions (both pull-only): first-seen wins (stable)", () => {
    const existing = { hasAdmin: false, hasPush: false };
    const incoming = { hasAdmin: false, hasPush: false };
    expect(shouldReplaceEntry(existing, incoming)).toBe(false);
  });
});

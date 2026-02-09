import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";

import { base64url, buildJwt, parseLinkHeader } from "./mint-app-tokens-lib.js";

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

describe("base64url", () => {
  it("produces no +, /, or = characters", () => {
    // Use bytes that would produce all three in standard base64
    const tricky = Buffer.from([0xfb, 0xef, 0xbe, 0xff, 0xfe]);
    const result = base64url(tricky);
    expect(result).not.toMatch(/[+/=]/);
  });

  it("round-trips through standard base64 decoding", () => {
    const input = "Hello, world!";
    const encoded = base64url(input);
    // Reverse the url-safe replacements and re-pad
    let standard = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (standard.length % 4 !== 0) standard += "=";
    const decoded = Buffer.from(standard, "base64").toString("utf8");
    expect(decoded).toBe(input);
  });

  it("accepts both Buffer and string inputs", () => {
    const str = "test";
    const buf = Buffer.from(str, "utf8");
    expect(base64url(str)).toBe(base64url(buf));
  });
});

// ---------------------------------------------------------------------------
// buildJwt
// ---------------------------------------------------------------------------

describe("buildJwt", () => {
  // Generate a throwaway RSA key for testing
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  it("produces three dot-separated parts", () => {
    const jwt = buildJwt("12345", privateKey as string);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.length > 0)).toBe(true);
  });

  it("header decodes to RS256/JWT", () => {
    const jwt = buildJwt("12345", privateKey as string);
    const headerB64 = jwt.split(".")[0];
    let standard = headerB64.replace(/-/g, "+").replace(/_/g, "/");
    while (standard.length % 4 !== 0) standard += "=";
    const header = JSON.parse(Buffer.from(standard, "base64").toString("utf8"));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
  });

  it("payload contains iss, iat, exp with correct types", () => {
    const jwt = buildJwt("99999", privateKey as string);
    const payloadB64 = jwt.split(".")[1];
    let standard = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    while (standard.length % 4 !== 0) standard += "=";
    const payload = JSON.parse(Buffer.from(standard, "base64").toString("utf8"));

    expect(payload.iss).toBe("99999");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });
});

// ---------------------------------------------------------------------------
// parseLinkHeader
// ---------------------------------------------------------------------------

describe("parseLinkHeader", () => {
  it("returns empty object for null input", () => {
    expect(parseLinkHeader(null)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseLinkHeader("")).toEqual({});
  });

  it("extracts next URL from GitHub-style Link header", () => {
    const header =
      '<https://api.github.com/app/installations?page=2>; rel="next", ' +
      '<https://api.github.com/app/installations?page=5>; rel="last"';
    const links = parseLinkHeader(header);
    expect(links.next).toBe("https://api.github.com/app/installations?page=2");
    expect(links.last).toBe("https://api.github.com/app/installations?page=5");
  });

  it("handles header with no next rel", () => {
    const header = '<https://api.github.com/app/installations?page=1>; rel="prev"';
    const links = parseLinkHeader(header);
    expect(links.next).toBeUndefined();
    expect(links.prev).toBe("https://api.github.com/app/installations?page=1");
  });
});

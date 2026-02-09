import { createPrivateKey, sign as cryptoSign } from "node:crypto";

export function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function buildJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: appId,
    iat: now - 60,
    exp: now + 10 * 60,
  };

  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;

  const keyObj = createPrivateKey(privateKeyPem);
  const sig = cryptoSign("RSA-SHA256", Buffer.from(signingInput, "utf8"), keyObj);

  return `${signingInput}.${base64url(sig)}`;
}

export function parseLinkHeader(linkHeader: string | null): Record<string, string> {
  if (!linkHeader) return {};
  const links: Record<string, string> = {};
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) links[m[2]] = m[1];
  }
  return links;
}

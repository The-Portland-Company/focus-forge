// Covers the forge-domain migration's dual-audience window: verifyAccessToken
// accepting an array of audiences, and authenticate() wiring the configured
// legacy resource(s) into local JWT verification (never into PAT exchange).
// All network I/O (JWKS) goes through a stubbed global fetch.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, type JWK, type CryptoKey } from "jose";

let TPC_RESOURCE: string;
let TPC_LEGACY_RESOURCES: string[];
let DEFAULT_ISSUER: string;
let verifyAccessToken: (token: string, opts: { resource: string | string[]; issuer?: string }) => Promise<any>;
let authenticate: (request: Request, opts: any) => Promise<any>;
let publicKey: CryptoKey;
let privateKey: CryptoKey;
let jwk: JWK;

const NEW_CANONICAL = "https://app.focusforge.dev";
const OLD_LEGACY = "https://focusforge.theportlandcompany.com";
const UNRELATED = "https://some-other-app.theportlandcompany.com";

before(async () => {
  ({ TPC_RESOURCE, TPC_LEGACY_RESOURCES } = await import("@/src/vendor/tpc-auth/config"));
  ({ DEFAULT_ISSUER } = await import("@/src/vendor/tpc-auth/types"));
  ({ verifyAccessToken } = await import("@/src/vendor/tpc-auth/verify"));
  ({ authenticate } = await import("@/src/vendor/tpc-auth/authenticate"));

  ({ publicKey, privateKey } = await generateKeyPair("RS256"));
  jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
});

const withStubbedJwks = async (run: () => Promise<void>) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch during test: ${url}`);
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
};

const mintToken = (audience: string) =>
  new SignJWT({ scope: "forge:read forge:write", app: "forge" })
    .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(audience)
    .setSubject("test-sub")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKey);

test("config: canonical resource is the new domain, old host is the only legacy resource", () => {
  assert.equal(TPC_RESOURCE, NEW_CANONICAL);
  assert.deepEqual(TPC_LEGACY_RESOURCES, [OLD_LEGACY]);
});

test("verifyAccessToken: accepts a token minted for the new canonical audience", async () => {
  await withStubbedJwks(async () => {
    const token = await mintToken(NEW_CANONICAL);
    const payload = await verifyAccessToken(token, { resource: [NEW_CANONICAL, OLD_LEGACY] });
    assert.equal(payload.aud, NEW_CANONICAL);
  });
});

test("verifyAccessToken: accepts a token still carrying the old legacy audience when passed as part of an array", async () => {
  await withStubbedJwks(async () => {
    const token = await mintToken(OLD_LEGACY);
    const payload = await verifyAccessToken(token, { resource: [NEW_CANONICAL, OLD_LEGACY] });
    assert.equal(payload.aud, OLD_LEGACY);
  });
});

test("verifyAccessToken: rejects a token minted for an unrelated audience", async () => {
  await withStubbedJwks(async () => {
    const token = await mintToken(UNRELATED);
    await assert.rejects(() => verifyAccessToken(token, { resource: [NEW_CANONICAL, OLD_LEGACY] }));
  });
});

test("authenticate(): accepts a JWT with the new canonical audience", async () => {
  await withStubbedJwks(async () => {
    const token = await mintToken(NEW_CANONICAL);
    const request = new Request("https://example.com", { headers: { Authorization: `Bearer ${token}` } });
    const ctx = await authenticate(request, { resource: TPC_RESOURCE, legacyResources: TPC_LEGACY_RESOURCES });
    assert.ok(ctx);
  });
});

test("authenticate(): accepts a pre-cutover JWT carrying the old legacy audience via legacyResources", async () => {
  await withStubbedJwks(async () => {
    const token = await mintToken(OLD_LEGACY);
    const request = new Request("https://example.com", { headers: { Authorization: `Bearer ${token}` } });
    const ctx = await authenticate(request, { resource: TPC_RESOURCE, legacyResources: TPC_LEGACY_RESOURCES });
    assert.ok(ctx);
  });
});

test("authenticate(): rejects a JWT minted for an unrelated audience even with legacyResources configured", async () => {
  await withStubbedJwks(async () => {
    const token = await mintToken(UNRELATED);
    const request = new Request("https://example.com", { headers: { Authorization: `Bearer ${token}` } });
    const ctx = await authenticate(request, { resource: TPC_RESOURCE, legacyResources: TPC_LEGACY_RESOURCES });
    assert.equal(ctx, null);
  });
});

test("authenticate(): without legacyResources, only the canonical audience is accepted (old host is rejected)", async () => {
  await withStubbedJwks(async () => {
    const token = await mintToken(OLD_LEGACY);
    const request = new Request("https://example.com", { headers: { Authorization: `Bearer ${token}` } });
    const ctx = await authenticate(request, { resource: TPC_RESOURCE });
    assert.equal(ctx, null);
  });
});

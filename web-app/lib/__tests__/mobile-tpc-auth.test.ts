// Covers lib/mobile/api.ts accepting a TPC Auth access token (in addition to
// the existing mobile Supabase JWT and personal-access-token paths). All
// network I/O (Supabase's /auth/v1/user and TPC Auth's JWKS endpoint) goes
// through a stubbed global fetch so the test never touches a live service.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, type JWK, type CryptoKey } from "jose";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "stub-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "stub-service-role-key";

let TPC_RESOURCE: string;
let DEFAULT_ISSUER: string;
let verifyMobileAccessTokenOrPat: (
  authHeader: string | null,
  requiredPatScopes?: ("read" | "write" | "admin")[],
) => Promise<any>;
let publicKey: CryptoKey;
let privateKey: CryptoKey;
let jwk: JWK;

before(async () => {
  ({ TPC_RESOURCE } = await import("@/src/vendor/tpc-auth/config"));
  ({ DEFAULT_ISSUER } = await import("@/src/vendor/tpc-auth/types"));
  ({ verifyMobileAccessTokenOrPat } = await import("@/lib/mobile/api"));

  ({ publicKey, privateKey } = await generateKeyPair("RS256"));
  jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
});

const mintTpcToken = (overrides: Record<string, unknown> = {}) =>
  new SignJWT({
    scope: "forge:read forge:write",
    app: "forge",
    email: "spencer@example.com",
    orgs: [],
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(TPC_RESOURCE)
    .setSubject("11111111-1111-1111-1111-111111111111")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKey);

const withStubbedFetch = async (run: () => Promise<void>) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/auth/v1/user")) {
      // Simulate Supabase rejecting a token it didn't mint, so the mobile
      // JWT check fails fast and falls through to the TPC check.
      return new Response(JSON.stringify({ message: "invalid JWT" }), { status: 401 });
    }
    if (url.includes("/rest/v1/personal_access_tokens")) {
      // No matching PAT row — PostgREST's "single row expected" shape, which
      // supabase-js's .maybeSingle() turns into { data: null, error: null }.
      return new Response(
        JSON.stringify({
          code: "PGRST116",
          details: "Results contain 0 rows",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }),
        { status: 406, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch during test: ${url} ${init?.method ?? "GET"}`);
  }) as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
};

test("accepts a TPC Auth access token and maps sub -> mobile user id", async () => {
  await withStubbedFetch(async () => {
    const token = await mintTpcToken();
    const auth = await verifyMobileAccessTokenOrPat(`Bearer ${token}`, ["read"]);
    assert.equal(auth.ok, true);
    if (auth.ok) {
      assert.equal(auth.user.id, "11111111-1111-1111-1111-111111111111");
      assert.equal(auth.user.email, "spencer@example.com");
    }
  });
});

test("rejects a TPC Auth token missing the required scope", async () => {
  await withStubbedFetch(async () => {
    const token = await mintTpcToken({ scope: "forge:read" });
    const auth = await verifyMobileAccessTokenOrPat(`Bearer ${token}`, ["write"]);
    assert.equal(auth.ok, false);
    if (!auth.ok) {
      assert.equal(auth.status, 403);
      assert.equal(auth.error.error?.code, "insufficient_scope");
    }
  });
});

test("rejects a TPC Auth token minted for a different audience", async () => {
  await withStubbedFetch(async () => {
    const token = await new SignJWT({
      scope: "forge:read forge:write",
      app: "forge",
    })
      .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
      .setIssuer(DEFAULT_ISSUER)
      .setAudience("https://some-other-app.theportlandcompany.com")
      .setSubject("11111111-1111-1111-1111-111111111111")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(privateKey);

    const auth = await verifyMobileAccessTokenOrPat(`Bearer ${token}`, ["read"]);
    assert.equal(auth.ok, false);
    if (!auth.ok) assert.equal(auth.error.error?.code, "invalid_access_token");
  });
});

test("falls through to the invalid-token error for a bearer token that is neither a mobile JWT, a TPC token, nor a PAT", async () => {
  await withStubbedFetch(async () => {
    const auth = await verifyMobileAccessTokenOrPat("Bearer not-a-real-token", ["read"]);
    assert.equal(auth.ok, false);
    if (!auth.ok) assert.equal(auth.error.error?.code, "invalid_access_token");
  });
});

// Covers lib/mobile/api.ts accepting a TPC Auth access token (in addition to
// the existing mobile Supabase JWT and personal-access-token paths). All
// network I/O (Supabase's /auth/v1/user, the admin `profiles` table, and TPC
// Auth's JWKS/userinfo endpoints) goes through a stubbed global fetch so the
// test never touches a live service.
//
// TPC subs are NOT Forge ids — the mobile API resolves the caller's real
// Forge profile via `profiles.tpc_sub`, falling back to a case-insensitive
// email match (and persisting the mapping on a hit). No match -> 403
// `no_forge_account`, never a raw TPC sub used as the Forge user id.
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

const FORGE_PROFILE_ID = "a31d128b-d330-487e-811a-22c7c1e11f88";
const TPC_SUB = "16650f26-d6d6-4cec-9476-504f1fdb971e";

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
    client_id: "swarm-tester-focus-forge",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(TPC_RESOURCE)
    .setSubject(TPC_SUB)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKey);

type ProfilesFixture = {
  bySub?: { id: string; email: string } | null;
  byEmail?: { id: string; email: string } | null;
};

const withStubbedFetch = async (
  fixture: ProfilesFixture,
  run: (calls: { profilePatches: unknown[] }) => Promise<void>,
) => {
  const original = globalThis.fetch;
  const calls = { profilePatches: [] as unknown[] };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

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
    if (url.includes("/rest/v1/profiles") && method === "GET") {
      const isSubLookup = url.includes("tpc_sub=eq.");
      const row = isSubLookup ? fixture.bySub : fixture.byEmail;
      if (!row) {
        // PostgREST's "single row expected, 0 returned" shape — what
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
      return new Response(JSON.stringify(row), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/profiles") && (method === "PATCH" || method === "POST")) {
      calls.profilePatches.push({ url, body: init?.body });
      return new Response(null, { status: 204 });
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
    throw new Error(`unexpected fetch during test: ${url} ${method}`);
  }) as typeof fetch;

  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
};

test("resolves a TPC Auth access token to the Forge profile matched by tpc_sub", async () => {
  await withStubbedFetch(
    { bySub: { id: FORGE_PROFILE_ID, email: "spencer@example.com" } },
    async (calls) => {
      const token = await mintTpcToken();
      const auth = await verifyMobileAccessTokenOrPat(`Bearer ${token}`, ["read"]);
      assert.equal(auth.ok, true);
      if (auth.ok) {
        assert.equal(auth.user.id, FORGE_PROFILE_ID);
        assert.notEqual(auth.user.id, TPC_SUB);
        assert.equal(auth.user.email, "spencer@example.com");
        assert.equal(auth.tpcSource, "swarm-tester");
      }
      // Already mapped by tpc_sub — no need to persist anything.
      assert.equal(calls.profilePatches.length, 0);
    },
  );
});

test("falls back to a case-insensitive email match and persists tpc_sub on the hit", async () => {
  await withStubbedFetch(
    { bySub: null, byEmail: { id: FORGE_PROFILE_ID, email: "spencer@example.com" } },
    async (calls) => {
      const token = await mintTpcToken({ email: "Spencer@Example.com" });
      const auth = await verifyMobileAccessTokenOrPat(`Bearer ${token}`, ["read"]);
      assert.equal(auth.ok, true);
      if (auth.ok) {
        assert.equal(auth.user.id, FORGE_PROFILE_ID);
      }
      assert.equal(calls.profilePatches.length, 1);
    },
  );
});

test("rejects a TPC Auth token whose identity matches no Forge profile", async () => {
  await withStubbedFetch({ bySub: null, byEmail: null }, async () => {
    const token = await mintTpcToken();
    const auth = await verifyMobileAccessTokenOrPat(`Bearer ${token}`, ["read"]);
    assert.equal(auth.ok, false);
    if (!auth.ok) {
      assert.equal(auth.status, 403);
      assert.equal(auth.error.error?.code, "no_forge_account");
    }
  });
});

test("rejects a TPC Auth token missing the required scope", async () => {
  await withStubbedFetch(
    { bySub: { id: FORGE_PROFILE_ID, email: "spencer@example.com" } },
    async () => {
      const token = await mintTpcToken({ scope: "forge:read" });
      const auth = await verifyMobileAccessTokenOrPat(`Bearer ${token}`, ["write"]);
      assert.equal(auth.ok, false);
      if (!auth.ok) {
        assert.equal(auth.status, 403);
        assert.equal(auth.error.error?.code, "insufficient_scope");
      }
    },
  );
});

test("rejects a TPC Auth token minted for a different audience", async () => {
  await withStubbedFetch(
    { bySub: { id: FORGE_PROFILE_ID, email: "spencer@example.com" } },
    async () => {
      const token = await new SignJWT({
        scope: "forge:read forge:write",
        app: "forge",
      })
        .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
        .setIssuer(DEFAULT_ISSUER)
        .setAudience("https://some-other-app.theportlandcompany.com")
        .setSubject(TPC_SUB)
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(privateKey);

      const auth = await verifyMobileAccessTokenOrPat(`Bearer ${token}`, ["read"]);
      assert.equal(auth.ok, false);
      if (!auth.ok) assert.equal(auth.error.error?.code, "invalid_access_token");
    },
  );
});

test("falls through to the invalid-token error for a bearer token that is neither a mobile JWT, a TPC token, nor a PAT", async () => {
  await withStubbedFetch({ bySub: null, byEmail: null }, async () => {
    const auth = await verifyMobileAccessTokenOrPat("Bearer not-a-real-token", ["read"]);
    assert.equal(auth.ok, false);
    if (!auth.ok) assert.equal(auth.error.error?.code, "invalid_access_token");
  });
});

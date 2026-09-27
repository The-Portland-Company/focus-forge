// Covers middleware.ts's TPC session gate (Edge runtime). All network I/O
// (JWKS lookup, the OIDC refresh-grant endpoint) goes through a stubbed
// global fetch — no live TPC Auth service is touched.
//
// Cases: no cookie -> redirect (page) / 401 (API); a valid TPC access-token
// cookie -> passes through; an expired/tampered cookie with no usable refresh
// token -> rejected; a request carrying its own `Authorization: Bearer`
// bypasses the cookie gate entirely, as the mobile/PAT bearer path always has.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, type JWK, type CryptoKey } from "jose";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "stub-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "stub-service-role-key";

let TPC_RESOURCE: string;
let DEFAULT_ISSUER: string;
let middleware: (request: NextRequest) => Promise<Response>;
let publicKey: CryptoKey;
let privateKey: CryptoKey;
let jwk: JWK;

before(async () => {
  ({ TPC_RESOURCE } = await import("@/src/vendor/tpc-auth/config"));
  ({ DEFAULT_ISSUER } = await import("@/src/vendor/tpc-auth/types"));
  ({ middleware } = await import("@/middleware"));

  ({ publicKey, privateKey } = await generateKeyPair("RS256"));
  jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
});

const mintAccessToken = (overrides: Record<string, unknown> = {}) =>
  new SignJWT({
    scope: "forge:read forge:write",
    app: "forge",
    email: "spencer@example.com",
    orgs: [],
    client_id: "focus-forge",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(TPC_RESOURCE)
    .setSubject("16650f26-d6d6-4cec-9476-504f1fdb971e")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKey);

const withStubbedFetch = async (
  opts: { refreshGrantsToken?: boolean } = {},
  run: () => Promise<void>,
) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/oauth/token") && method === "POST") {
      if (!opts.refreshGrantsToken) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      }
      const fresh = await mintAccessToken();
      return new Response(
        JSON.stringify({
          access_token: fresh,
          refresh_token: "rotated-refresh-token",
          token_type: "Bearer",
          expires_in: 900,
          scope: "forge:read forge:write",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch during test: ${url} ${method}`);
  }) as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
};

const req = (path: string, init?: { cookies?: Record<string, string>; headers?: Record<string, string> }) => {
  const request = new NextRequest(new URL(path, "https://focusforge.theportlandcompany.com"), {
    headers: init?.headers,
  });
  for (const [name, value] of Object.entries(init?.cookies ?? {})) {
    request.cookies.set(name, value);
  }
  return request;
};

test("no session cookie: page request redirects to /auth/login", async () => {
  await withStubbedFetch({}, async () => {
    const res = await middleware(req("/dashboard"));
    assert.equal(res.status, 307);
    const location = res.headers.get("location");
    assert.ok(location);
    const url = new URL(location!);
    assert.equal(url.pathname, "/auth/login");
    assert.equal(url.searchParams.get("next"), "/dashboard");
  });
});

test("no session cookie: API request gets 401 JSON", async () => {
  await withStubbedFetch({}, async () => {
    const res = await middleware(req("/api/tasks"));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "Unauthorized");
  });
});

test("valid TPC access-token cookie passes through", async () => {
  await withStubbedFetch({}, async () => {
    const token = await mintAccessToken();
    const res = await middleware(req("/dashboard", { cookies: { ff_at: token } }));
    // NextResponse.next() carries this header on the pass-through response.
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

test("expired/tampered cookie with no working refresh is rejected", async () => {
  await withStubbedFetch({ refreshGrantsToken: false }, async () => {
    const expired = await new SignJWT({
      scope: "forge:read forge:write",
      app: "forge",
      email: "spencer@example.com",
      orgs: [],
      client_id: "focus-forge",
    })
      .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
      .setIssuer(DEFAULT_ISSUER)
      .setAudience(TPC_RESOURCE)
      .setSubject("16650f26-d6d6-4cec-9476-504f1fdb971e")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(privateKey);

    const res = await middleware(
      req("/api/tasks", { cookies: { ff_at: expired, ff_rt: "stale-refresh-token" } }),
    );
    assert.equal(res.status, 401);
  });
});

test("tampered cookie (bad signature), no refresh cookie: rejected", async () => {
  await withStubbedFetch({}, async () => {
    const token = await mintAccessToken();
    const tampered = token.slice(0, -4) + "abcd";
    const res = await middleware(req("/api/tasks", { cookies: { ff_at: tampered } }));
    assert.equal(res.status, 401);
  });
});

test("expired cookie with a working refresh token rotates and passes", async () => {
  await withStubbedFetch({ refreshGrantsToken: true }, async () => {
    const expired = await new SignJWT({
      scope: "forge:read forge:write",
      app: "forge",
      email: "spencer@example.com",
      orgs: [],
      client_id: "focus-forge",
    })
      .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
      .setIssuer(DEFAULT_ISSUER)
      .setAudience(TPC_RESOURCE)
      .setSubject("16650f26-d6d6-4cec-9476-504f1fdb971e")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(privateKey);

    const res = await middleware(
      req("/api/tasks", { cookies: { ff_at: expired, ff_rt: "valid-refresh-token" } }),
    );
    assert.equal(res.headers.get("x-middleware-next"), "1");
    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.ok(setCookie.includes("ff_at="));
  });
});

test("Authorization: Bearer header bypasses the cookie gate entirely", async () => {
  await withStubbedFetch({}, async () => {
    const res = await middleware(
      req("/api/tasks", { headers: { authorization: "Bearer some-mobile-or-pat-token" } }),
    );
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

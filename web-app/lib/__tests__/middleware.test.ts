// Covers middleware.ts's TPC session gate (Edge runtime). All network I/O
// (JWKS lookup, the OIDC refresh-grant endpoint) goes through a stubbed
// global fetch — no live TPC Auth service is touched.
//
// Cases: no cookie -> redirect (page) / 401 (API); a valid TPC access-token
// cookie -> passes through; an expired/tampered cookie with no usable refresh
// token -> rejected; a junk `Authorization: Bearer` header does NOT bypass the
// gate on an ordinary route (only the explicit `publicRoutes` prefixes do,
// and only because the routes behind them self-authenticate the bearer).
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

test("a junk bearer on a gated route does NOT bypass the cookie gate: 401", async () => {
  // Regression test: middleware previously let ANY Authorization header
  // through unconditionally, which let an unauthenticated caller reach
  // routes (invite-user, todoist/*, test-data, etc.) that had no auth check
  // of their own. Only the explicit public-route prefixes (/api/mobile,
  // /api/sync/comments, ...) may accept a bearer credential; every other
  // route must still see a valid session cookie.
  await withStubbedFetch({}, async () => {
    const res = await middleware(
      req("/api/tasks", { headers: { authorization: "Bearer some-junk-token" } }),
    );
    assert.equal(res.status, 401);
  });
});

test("Authorization: Bearer header on an explicitly public/self-authing route bypasses the cookie gate", async () => {
  await withStubbedFetch({}, async () => {
    const res = await middleware(
      req("/api/mobile/tasks", { headers: { authorization: "Bearer some-mobile-or-pat-token" } }),
    );
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

test("Specs->Forge connector inbound sync route bypasses the cookie gate", async () => {
  // /api/connectors/specs/events self-authenticates via Authorization: Bearer
  // <FORGE_PAT> + X-Specs-Forge-Signature inside the route (see
  // app/api/connectors/specs/events/route.ts) -- Specs' server has no Forge
  // session cookie, so middleware must not 401 it before the route runs.
  await withStubbedFetch({}, async () => {
    const res = await middleware(
      req("/api/connectors/specs/events", {
        headers: { authorization: "Bearer some-forge-pat" },
      }),
    );
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

test("a bearer on /api/mcp reaches the route (no Forge session required)", async () => {
  // /api/mcp is a TPC Auth protected resource, not a Forge-session route — an
  // MCP client authenticates with a TPC access token / PAT, never a Forge
  // cookie. The route's own authenticate() call (not this middleware) is
  // what validates the token; middleware must just get out of the way.
  await withStubbedFetch({}, async () => {
    const res = await middleware(
      req("/api/mcp", { headers: { authorization: "Bearer some-tpc-token-or-pat" } }),
    );
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

test("the MCP protected-resource metadata is reachable with no credential at all", async () => {
  // RFC 9728 discovery: a fresh MCP client fetches this BEFORE it has any
  // token, to learn which authorization server to register with.
  await withStubbedFetch({}, async () => {
    const res = await middleware(req("/.well-known/oauth-protected-resource/mcp"));
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

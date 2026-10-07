import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authenticate } from "@/src/vendor/tpc-auth/authenticate";
import { refresh as refreshTokens } from "@/src/vendor/tpc-auth/oidc";
import { TPC_CLIENT_ID, TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";
import type { AuthContext } from "@/src/vendor/tpc-auth/types";
import { getCanonicalRedirectUrl } from "@/lib/auth/canonical-host";

// TPC Auth session cookies. Duplicated (not imported) from
// lib/auth/tpc-session.ts: that module reaches for `cookies()` from
// next/headers, which is only valid inside a Server Component / Route
// Handler request scope, not the separate Edge middleware runtime — this file
// reads/writes the same two cookies via NextRequest/NextResponse instead.
const ACCESS_COOKIE = "ff_at";
const REFRESH_COOKIE = "ff_rt";
const REFRESH_TTL_S = 30 * 86400;

// Public routes that don't require authentication
const publicRoutes = [
  "/robots.txt",
  "/favicon.ico",
  "/favicon.png",
  "/favicon.svg",
  "/icon.svg",
  // PWA install assets must be publicly fetchable so the OS can register the
  // app (and render the Dock badge) without an app session.
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  // Canonical TPC icon set (favicon.ico, apple-touch-icon, PNG sizes, circle
  // variants) lives under /icons/ — must be publicly fetchable for the same
  // reason as the PWA assets above (OS/browser icon discovery, no session).
  "/icons",
  // Integration logos (e.g. task-source icons) must be publicly fetchable so
  // they render on logged-out share pages.
  "/integrations",
  // TPC Auth login redirect + its callback — both must be reachable with no
  // session yet (that's the point of them).
  "/auth/login",
  "/auth/callback",
  // Public legal/support pages — must be reachable without an account
  // (App Store review requires a publicly accessible privacy policy).
  "/privacy",
  "/support",
  // Public marketing page for the Focus: Time macOS desktop app.
  "/desktop",
  // Public read-only project share pages + their passcode-verify endpoint must
  // render for logged-out visitors (no session required).
  "/share",
  "/api/share",
  // Public email-attachment share links — an unguessable token gates each one;
  // the recipient has no Focus Forge account, so this must render logged-out.
  "/api/public/attachments",
  "/docs/focus-time-agent",
  "/docs/focus-time-openapi",
  "/developer/api",
  "/api/auth/logout",
  "/api/users",
  "/api/mobile",
  // Proof-media upload self-authenticates (a Forge organization API key for the
  // server-to-server DevNotes path, or a member session) inside the route, like
  // /api/mobile — so it must bypass the session-only middleware gate.
  "/api/proof/upload",
  // Sentry issue webhook self-authenticates via an HMAC-SHA256 signature
  // (sentry-hook-signature) verified inside the route against the connection's
  // shared secret — the caller (Sentry) has no Forge session, so it must bypass
  // the session-only gate, like /api/mobile and /api/proof/upload.
  "/api/sentry/webhook",
  // Specs -> Forge inbound sync (contract §2/§9) self-authenticates via
  // Authorization: Bearer <FORGE_PAT> + X-Specs-Forge-Signature (HMAC,
  // SPECS_SYNC_SECRET) inside the route, like /api/mobile — the caller is
  // Specs' server, which has no Forge session, so this must bypass the
  // session-only gate. (Was missing here since #226; every real inbound
  // sync 401'd at this gate before reaching the route's own auth.)
  "/api/connectors/specs/events",
  // Same self-authenticating Specs<->Forge connector (verifyMobileAccessTokenOrPat
  // against a Forge PAT, scopes read/write/admin) as /events above. These two were
  // omitted from the original #226 rollout, so Specs' reconcile job (GET .../tree)
  // and status checks 401'd at this gate before ever reaching the route's own auth
  // — reconcile has never recorded a successful run as a result. Fixed 2026-10-03.
  "/api/connectors/specs/tree",
  "/api/connectors/specs/status",
  "/api/sync/comments",
  "/api/health",
  "/api/calendar/feed",
  "/api/v1/time",
  "/api/v1/time/prompt",
  "/api/v1/time/openapi",
  // MCP server: a TPC Auth protected resource (RFC 9728/8707), not a Forge
  // session. It self-authenticates via authenticate() against a TPC access
  // token or `tpc_pat_…` PAT bound to TPC_RESOURCE and returns its own 401
  // (with WWW-Authenticate pointing at the metadata below) on failure — the
  // session-only gate here must not intercept that with a bare 401 first.
  "/api/mcp",
  // RFC 9728 protected-resource metadata for the MCP server: static JSON (the
  // authorization server + supported scopes) that an MCP client fetches
  // BEFORE it has any credential, to learn where to authenticate. No session,
  // no secret — this is the doorway, not a door.
  "/.well-known/oauth-protected-resource",
];

const securityHeaders = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'self'",
};

const applySecurityHeaders = (response: NextResponse) => {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
};

/**
 * Verify the caller's TPC session cookie, transparently refreshing an expired
 * access token from the refresh cookie — the Edge-runtime mirror of
 * lib/auth/tpc-session.ts#getTpcSession(). `authenticate()` and `refresh()`
 * only use `fetch`/`crypto.subtle` (via `jose`), so both run fine here.
 * Returns the verified session plus any rotated tokens middleware must write
 * back onto the response, or null when there is no valid session.
 */
async function getEdgeSession(request: NextRequest): Promise<{
  ctx: AuthContext;
  rotated?: { access_token: string; refresh_token?: string; expires_in?: number };
} | null> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const req = new Request(TPC_RESOURCE, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const ctx = await authenticate(req, { resource: TPC_RESOURCE });
    if (ctx) return { ctx };
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;

  try {
    const tokens = await refreshTokens({
      clientId: TPC_CLIENT_ID,
      refreshToken,
      resource: TPC_RESOURCE,
    });
    const req = new Request(TPC_RESOURCE, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const ctx = await authenticate(req, { resource: TPC_RESOURCE });
    if (!ctx) return null;
    return { ctx, rotated: tokens };
  } catch {
    return null;
  }
}

/** Write a rotated access/refresh token pair onto the outgoing response. */
function applyRotatedCookies(
  target: NextResponse,
  rotated: { access_token: string; refresh_token?: string; expires_in?: number },
) {
  target.cookies.set(ACCESS_COOKIE, rotated.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, rotated.expires_in ?? 900),
  });
  if (rotated.refresh_token) {
    target.cookies.set(REFRESH_COOKIE, rotated.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_TTL_S,
    });
  }
  return target;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase();

  // Allow server actions to bypass auth middleware
  if (request.headers.has("next-action")) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Railway healthchecks may come through as plain HTTP internally; do not redirect them.
  if (pathname.startsWith("/api/health")) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Internal loopback endpoints (the in-process EmailLiveSync worker POSTing to
  // 127.0.0.1) authenticate with their own token and must bypass the HTTPS-enforce
  // redirect and the auth gate. Without this the worker's plain-HTTP request
  // got a 301 to https://, so autonomous sync never reached the route.
  if (pathname.startsWith("/api/internal/")) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Enforce HTTPS in production
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = "https:";
    return NextResponse.redirect(httpsUrl, 301);
  }

  // Canonical production host redirect.
  if (process.env.NODE_ENV === "production") {
    const canonicalUrl = getCanonicalRedirectUrl(request.url, host, request.method);
    if (canonicalUrl) {
      return NextResponse.redirect(canonicalUrl, 308);
    }
  }

  // Check if the route is public
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route),
  );

  if (isPublicRoute) {
    return applySecurityHeaders(NextResponse.next());
  }

  const session = await getEdgeSession(request);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }
    // No session: send the browser through the TPC Auth login flow,
    // preserving where it was headed via /auth/login's `next` param.
    const loginUrl = new URL("/auth/login", request.url);
    if (pathname && pathname !== "/") {
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  let response = applySecurityHeaders(NextResponse.next());
  if (session.rotated) {
    response = applyRotatedCookies(response, session.rotated);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next (all Next.js internal assets and data endpoints)
     * - __next_action (server actions)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next|__next_action|favicon.ico|public).*)",
  ],
};

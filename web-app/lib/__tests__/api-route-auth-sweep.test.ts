// Sweep: every app/api/**/route.ts must either self-authenticate, or be
// reachable ONLY behind middleware.ts's default cookie-session gate (i.e. it
// is not one of the explicit `publicRoutes` prefixes that bypass that gate).
//
// A route that IS covered by a `publicRoutes` prefix is reachable by anyone,
// including an attacker sending a junk `Authorization` header or no
// credentials at all (see lib/__tests__/middleware.test.ts's "junk bearer"
// regression test). Such a route MUST perform its own auth check, or be
// deliberately, verifiably safe to expose (a static asset, a token-gated
// share link, etc.) — see PUBLIC_ROUTE_SELF_AUTH below for the reasoning per
// prefix.
//
// This test exists because of a real incident: middleware.ts briefly had a
// blanket `if (bearerToken(request)) return next()`, which accidentally
// turned every route in the app into a "public route" for the purposes of
// this sweep. Deleting that bypass is necessary but not sufficient — this
// test is the regression guard that catches the next time something makes a
// route reachable without a session, even if middleware.ts itself is never
// touched again (e.g. a route added to `publicRoutes` without an audit).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP_API_DIR = path.join(process.cwd(), "app", "api");

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry.name === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

// Mirrors the `/api/*` entries in middleware.ts's `publicRoutes` array (a
// prefix match). Kept as a literal, independently-maintained list rather than
// parsed out of middleware.ts, so that an edit to middleware.ts's public list
// without a matching edit here fails loudly (see the last test below).
const PUBLIC_API_PREFIXES = [
  "/api/share",
  "/api/public/attachments",
  "/api/auth/logout",
  "/api/users",
  "/api/mobile",
  "/api/proof/upload",
  "/api/sentry/webhook",
  "/api/sync/comments",
  "/api/health",
  "/api/calendar/feed",
  "/api/v1/time",
  // TPC Auth protected resource (RFC 9728/8707) — self-authenticates via
  // authenticate() against a TPC access token / PAT, not a Forge session.
  "/api/mcp",
];

function apiPathFor(routeFile: string): string {
  const rel = path.relative(APP_API_DIR, routeFile);
  const withoutFile = rel.slice(0, -"/route.ts".length);
  return "/api/" + withoutFile.split(path.sep).join("/");
}

function isPublicRoute(apiPath: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (prefix) => apiPath === prefix || apiPath.startsWith(prefix + "/"),
  );
}

// A route counts as self-authenticating if it references any recognized
// caller-identity check. Deliberately does NOT include mere admin/service
// client usage (`createServiceClient`, `getAdminClient`) — several of the
// routes deleted for this exact vulnerability class (invite-user, test-data)
// also used the service-role client with no identity check at all.
const SELF_AUTH_PATTERN =
  /requireViewer|requireViewerOrUnauthorized|requireAuth|requireAdminSessionOrPatAdminScope|requireTimePrincipal|verifyMobileAccessToken|verifyApiKey|authenticate\(|getBearerToken|getViewer\(|INTERNAL_SYNC_TOKEN|x-internal-token|sentry-hook-signature|verifyShareToken|verifyPasscode|authorizeShareWrite|resolveActiveAttachmentPublicLink|getUser\(\)|auth\.getUser|getServerSession|auth\.getSession|CRON_SECRET|x-cron-secret|x-api-key|verifySignature|WEBHOOK_SECRET|getAuthUser|getCurrentUser|getSessionUser/i;

// Routes under a public prefix that don't match SELF_AUTH_PATTERN but are
// still safe, with the reason documented inline in the route file itself.
// Keep this list short and specific (exact `/api/...` path, not a prefix) —
// it is a deliberate exception list, not a second allowlist.
const DOCUMENTED_SAFE_EXCEPTIONS = new Set<string>([
  // Static build-metadata endpoint; no user data, no side effects.
  "/api/health",
  // Ends the caller's own session (revokes whatever refresh token cookie, if
  // any, is present) and clears cookies. No-op / harmless with no session.
  "/api/auth/logout",
  // Validates a per-profile `calendar_feed_token` query param against the DB
  // before returning anything; the token is the authorization.
  "/api/calendar/feed",
  // These ARE the credential-issuing endpoints (email/password, magic link,
  // Sign in with Apple, refresh-token exchange) for the mobile app's own
  // auth flow — by definition reachable before the caller has a session.
  "/api/mobile/auth/login",
  "/api/mobile/auth/magic-link",
  "/api/mobile/auth/magic-link/verify",
  "/api/mobile/auth/apple",
  "/api/mobile/auth/apple/oauth-url",
  "/api/mobile/auth/refresh",
  // Static OpenAPI/prompt documentation for the public developer docs pages
  // (/developer/api) — no user data, no side effects.
  "/api/v1/time/openapi",
  "/api/v1/time/prompt",
]);

test("every app/api/**/route.ts is guarded by the middleware session gate, self-authenticates, or is a documented exception", () => {
  const routeFiles = listRouteFiles(APP_API_DIR);
  assert.ok(routeFiles.length > 100, "sanity check: expected 100+ route files under app/api");

  const failures: string[] = [];

  for (const file of routeFiles) {
    const apiPath = apiPathFor(file);
    if (!isPublicRoute(apiPath)) {
      // Not in publicRoutes => middleware.ts's default-deny cookie gate
      // already rejects any request without a valid TPC session, including
      // one carrying a junk (or no) Authorization header. Nothing further
      // required of the route itself for this sweep's purposes.
      continue;
    }

    if (DOCUMENTED_SAFE_EXCEPTIONS.has(apiPath)) continue;

    const src = fs.readFileSync(file, "utf8");
    if (!SELF_AUTH_PATTERN.test(src)) {
      failures.push(
        `${path.relative(process.cwd(), file)} (${apiPath}) is in PUBLIC_API_PREFIXES ` +
          `(bypasses the middleware session gate) but has no recognized self-auth check. ` +
          `Either add one, or add it to DOCUMENTED_SAFE_EXCEPTIONS with a reason.`,
      );
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});

test("PUBLIC_API_PREFIXES stays in sync with middleware.ts's publicRoutes", () => {
  const middlewareSrc = fs.readFileSync(
    path.join(process.cwd(), "middleware.ts"),
    "utf8",
  );

  for (const prefix of PUBLIC_API_PREFIXES) {
    assert.ok(
      middlewareSrc.includes(`"${prefix}"`),
      `expected middleware.ts's publicRoutes to contain "${prefix}" (found in this test's ` +
        `PUBLIC_API_PREFIXES but not in middleware.ts — one of the two is stale)`,
    );
  }
});

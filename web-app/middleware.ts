import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/accept-invite",
  // Public legal/support pages — must be reachable without an account
  // (App Store review requires a publicly accessible privacy policy).
  "/privacy",
  "/support",
  // Public marketing page for the Focus: Time macOS desktop app.
  "/desktop",
  // Public read-only project share pages + their passcode-verify endpoint must
  // render for logged-out visitors (no session / no MFA required).
  "/share",
  "/api/share",
  // Public email-attachment share links — an unguessable token gates each one;
  // the recipient has no Focus Forge account, so this must render logged-out.
  "/api/public/attachments",
  "/docs/focus-time-agent",
  "/docs/focus-time-openapi",
  "/developer/api",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/logout",
  "/api/users",
  "/api/mobile",
  "/api/sync/comments",
  "/api/accept-invite",
  "/api/health",
  "/api/calendar/feed",
  "/api/v1/time",
  "/api/v1/time/prompt",
  "/api/v1/time/openapi",
];

const securityHeaders = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'self'",
};

// The unified MFA gate page: handles both first-time TOTP enrollment and the
// per-login OTP challenge, elevating the session to aal2. Reachable while aal1.
const MFA_GATE_PATH = "/auth/mfa";

// Global "logged out before" cutoff (unix seconds). Any access token issued
// (`iat`) before this instant is treated as logged out — this is the only way
// to immediately invalidate already-issued stateless JWTs (deleting server-side
// sessions only stops refresh; a live access token keeps working until it
// expires). Bump this to force-log-everyone-out again. Set 2026-07-14 when all
// sessions were revoked ahead of the MFA rollout.
const SESSION_MIN_IAT = 1784069036;

// Read the aal + iat claims from a Supabase access token (JWT) without
// verifying it — used only to route to the MFA gate and enforce the logout
// cutoff; a tampered token is rejected by Supabase on the next real API call.
function decodeAccessToken(accessToken: string | undefined): {
  aal: string;
  iat: number;
} {
  if (!accessToken) return { aal: "aal1", iat: 0 };
  try {
    const part = accessToken.split(".")[1];
    if (!part) return { aal: "aal1", iat: 0 };
    let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    return {
      aal: typeof payload?.aal === "string" ? payload.aal : "aal1",
      iat: typeof payload?.iat === "number" ? payload.iat : 0,
    };
  } catch {
    return { aal: "aal1", iat: 0 };
  }
}

const applySecurityHeaders = (response: NextResponse) => {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  // redirect and the auth/MFA gates. Without this the worker's plain-HTTP request
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
  if (
    process.env.NODE_ENV === "production" &&
    (host === "focusflow.theportlandcompany.com" ||
      host === "focus-forge.theportlandcompany.com")
  ) {
    const canonicalUrl = new URL(request.url);
    canonicalUrl.host = "focusforge.theportlandcompany.com";
    return NextResponse.redirect(canonicalUrl, 301);
  }

  // Check if the route is public
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route),
  );

  if (isPublicRoute) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Fail clearly when env is missing instead of throwing at createServerClient.
  if (!supabaseUrl || !supabaseAnonKey) {
    const message =
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY";
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        NextResponse.json({ error: message }, { status: 500 }),
      );
    }
    return applySecurityHeaders(
      new NextResponse(message, { status: 500, headers: { "content-type": "text/plain" } }),
    );
  }

  // Create a response that we'll modify
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create a Supabase client for authentication
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          const secureOptions =
            process.env.NODE_ENV === "production"
              ? { ...options, secure: true, sameSite: "lax" as const }
              : options;
          request.cookies.set(name, value);
          response.cookies.set(name, value, secureOptions);
        },
        remove(name: string, options: any) {
          const secureOptions =
            process.env.NODE_ENV === "production"
              ? { ...options, secure: true, sameSite: "lax" as const }
              : options;
          request.cookies.delete(name);
          response.cookies.set(name, "", { ...secureOptions, maxAge: 0 });
        },
      },
    },
  );

  // Carry any auth cookies Supabase refreshed onto whatever response we return.
  //
  // getSession() below auto-refreshes the access token and writes the rotated
  // session cookies onto `response` (via the set/remove callbacks above). Every
  // branch that returns a DIFFERENT response object — the redirects and the
  // /api/ response that adds x-user-id — would otherwise silently drop those
  // Set-Cookie headers, so the rotated refresh token never reaches the browser.
  // On concurrent requests (the client loads /api/sync/database and
  // /api/organizations at once) each one then rotates the token and invalidates
  // its siblings → intermittent 401s (organizations fails to load) and a
  // redirect loop back to /auth/login. Copying the cookies through fixes both.
  const carryAuthCookies = (target: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
    return applySecurityHeaders(target);
  };

  // Check for authenticated user using getSession instead of getUser
  // getSession doesn't verify the JWT, avoiding refresh token issues
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    // Redirect to login page if not authenticated
    if (pathname.startsWith("/api/")) {
      // For API routes, return 401
      return carryAuthCookies(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    // For page routes, redirect to login
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return carryAuthCookies(NextResponse.redirect(loginUrl));
  }

  const { aal, iat } = decodeAccessToken(session.access_token);

  // Hard logout cutoff: reject tokens issued before the global cutoff so a
  // revoked/older session cannot keep using a still-valid access token.
  if (iat && iat < SESSION_MIN_IAT) {
    if (pathname.startsWith("/api/")) {
      return carryAuthCookies(
        NextResponse.json({ error: "Session expired" }, { status: 401 }),
      );
    }
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return carryAuthCookies(NextResponse.redirect(loginUrl));
  }

  // MFA gate: any authenticated session below aal2 must complete TOTP MFA
  // (first-time enrollment or the per-login OTP challenge) at the gate page
  // before it can reach the app. The gate page itself, and the logout route,
  // stay reachable while aal1 so the user can finish or bail out.
  const isMfaExempt =
    pathname.startsWith(MFA_GATE_PATH) ||
    pathname.startsWith("/api/auth/mfa") ||
    pathname.startsWith("/api/auth/logout");
  if (aal !== "aal2" && !isMfaExempt) {
    if (pathname.startsWith("/api/")) {
      return carryAuthCookies(
        NextResponse.json({ error: "MFA required" }, { status: 403 }),
      );
    }
    const mfaUrl = new URL(MFA_GATE_PATH, request.url);
    if (pathname && pathname !== "/") {
      mfaUrl.searchParams.set("from", pathname);
    }
    return carryAuthCookies(NextResponse.redirect(mfaUrl));
  }

  // Add user ID to headers for API routes
  if (pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", session.user.id);

    return carryAuthCookies(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
    );
  }

  return applySecurityHeaders(response);
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

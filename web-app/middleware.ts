import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Public routes that don't require authentication
const publicRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/accept-invite",
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
  "/api/v1/time/prompt",
  "/api/v1/time/openapi",
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
      return applySecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    // For page routes, redirect to login
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // Add user ID to headers for API routes
  if (pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", session.user.id);

    return applySecurityHeaders(
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

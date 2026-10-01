// Fronts the bare apex (and www) of focusforge.dev. The apex now serves the
// marketing site (Cloudflare Pages); the app lives at app.focusforge.dev.
//
// Routing:
//   1. www.*                              -> 308 to the same path on the apex
//   2. /api/*, /.well-known/*, /auth/callback*
//                                          -> proxied (not redirected) to the
//                                             app, preserving method/headers/body,
//                                             so installed clients, PATs, MCP
//                                             connectors and the OAuth callback
//                                             keep working against the apex too
//   3. marketing-owned paths              -> served from the Pages deployment
//   4. everything else (app page routes)  -> 308 to the same path on the app
//
// Marketing-owned paths must stay in sync with marketing-site/app's real
// top-level routes. Anything not listed here falls through to the app
// redirect, which is the safe default (new app routes don't need a Worker
// deploy to keep working).
export interface Env {
  APP_ORIGIN: string;
  MARKETING_ORIGIN: string;
}

const PROXY_PREFIXES = ["/api/", "/.well-known/", "/auth/callback"];

const MARKETING_EXACT_PATHS = new Set([
  "/",
  "/compare",
  "/privacy",
  "/terms",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
]);

const MARKETING_PREFIXES = ["/compare/", "/_next/", "/images/", "/fonts/"];

function isMarketingPath(pathname: string): boolean {
  if (MARKETING_EXACT_PATHS.has(pathname)) return true;
  return MARKETING_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProxyPath(pathname: string): boolean {
  if (pathname === "/api") return true;
  return PROXY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // www -> apex, same path/query, before anything else.
    if (url.hostname === "www.focusforge.dev") {
      const target = new URL(request.url);
      target.hostname = "focusforge.dev";
      return Response.redirect(target.toString(), 308);
    }

    if (isProxyPath(url.pathname)) {
      const target = new URL(url.pathname + url.search, env.APP_ORIGIN);
      const proxied = new Request(target.toString(), request);
      proxied.headers.set("x-forwarded-host", url.hostname);
      proxied.headers.set("x-forwarded-proto", "https");
      return fetch(proxied);
    }

    if (isMarketingPath(url.pathname)) {
      const target = new URL(url.pathname + url.search, env.MARKETING_ORIGIN);
      const marketingRequest = new Request(target.toString(), request);
      marketingRequest.headers.set("host", new URL(env.MARKETING_ORIGIN).hostname);
      return fetch(marketingRequest);
    }

    // Everything else is assumed to be an app page route.
    const target = new URL(request.url);
    target.hostname = "app.focusforge.dev";
    return Response.redirect(target.toString(), 308);
  },
};

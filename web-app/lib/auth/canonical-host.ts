// Focus Forge's public home is https://focusforge.dev. The old TPC
// subdomains are retired for people but kept alive as an API alias:
// installed iOS/macOS builds, PATs, MCP connectors, crons and already-sent
// magic links still hit focusforge.theportlandcompany.com, and the TPC Auth
// token audience (TPC_RESOURCE) is still that URL. So only browser page
// navigations are redirected; /api, /.well-known and in-flight
// /auth/callback requests keep serving.
export const CANONICAL_HOST = "focusforge.dev";

const REDIRECT_EVERYTHING_HOSTS = new Set([
  "www.focusforge.dev",
  "focusflow.theportlandcompany.com",
  "focus-forge.theportlandcompany.com",
]);

const LEGACY_ALIAS_HOSTS = new Set(["focusforge.theportlandcompany.com"]);

const LEGACY_PASSTHROUGH_PREFIXES = ["/api/", "/auth/callback", "/.well-known/"];

export function getCanonicalRedirectUrl(
  requestUrl: string,
  host: string | null | undefined,
  method = "GET",
): URL | null {
  if (!host) return null;
  const bareHost = host.split(":")[0];

  if (LEGACY_ALIAS_HOSTS.has(bareHost)) {
    if (method !== "GET" && method !== "HEAD") return null;
    const { pathname } = new URL(requestUrl);
    if (
      pathname === "/api" ||
      LEGACY_PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ) {
      return null;
    }
  } else if (!REDIRECT_EVERYTHING_HOSTS.has(bareHost)) {
    return null;
  }

  const target = new URL(requestUrl);
  target.protocol = "https:";
  target.host = CANONICAL_HOST;
  target.port = "";
  return target;
}

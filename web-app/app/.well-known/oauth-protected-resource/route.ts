import { protectedResourceMetadata } from "@/src/vendor/tpc-auth/resource";
import { TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";

// RFC 9728 protected-resource metadata at the CANONICAL unscoped path.
//
// The MCP server's 401 challenge (vendor/tpc-auth/resource.ts `unauthorized()`)
// advertises `${origin}/.well-known/oauth-protected-resource` with NO `/mcp`
// suffix — because TPC_RESOURCE is the bare origin (https://app.focusforge.dev,
// no path), so the RFC 9728 well-known URL carries no path suffix. An MCP
// client therefore fetches exactly this URL to discover the authorization
// server. Previously only the `/mcp`-scoped sibling (./mcp/route.ts) existed,
// so the advertised URL 404'd (HTML), and clients aborted discovery with
// "JSON Parse error: Unrecognized token '<'" before they could open the
// browser to log in. This serves the identical payload at the URL the
// handshake actually points to.
export async function GET() {
  return protectedResourceMetadata(TPC_RESOURCE, ["forge:read", "forge:write"]);
}

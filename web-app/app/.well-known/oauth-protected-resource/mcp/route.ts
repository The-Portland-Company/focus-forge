import { protectedResourceMetadata } from "@/src/vendor/tpc-auth/resource";
import { TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";

// RFC 9728 protected-resource metadata for the MCP server, so a fresh MCP
// client can discover which authorization server (TPC Auth) to register
// with, with nothing pre-shared.
export async function GET() {
  // Resource must be exactly apps.resource_uri for "forge"
  // (https://app.focusforge.dev as of the domain migration — the old
  // https://focusforge.theportlandcompany.com is now a resource_alias, not
  // the canonical) — TPC Auth matches it exactly, so a "/mcp" suffix here
  // would make every PAT exchange and JWT audience check fail (this bit Ads
  // Control the same way). A new MCP client must discover the NEW resource
  // here; only already-issued JWTs (not PATs, not new clients) still carry
  // the old one, via TPC_LEGACY_RESOURCES in authenticate().
  return protectedResourceMetadata(TPC_RESOURCE, ["forge:read", "forge:write"]);
}

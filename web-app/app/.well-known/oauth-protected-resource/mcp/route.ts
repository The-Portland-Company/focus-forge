import { protectedResourceMetadata } from "@/src/vendor/tpc-auth/resource";
import { TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";

// RFC 9728 protected-resource metadata for the MCP server, so a fresh MCP
// client can discover which authorization server (TPC Auth) to register
// with, with nothing pre-shared.
export async function GET() {
  // Resource must be exactly apps.resource_uri for "forge"
  // (https://focusforge.theportlandcompany.com) — TPC Auth matches it
  // exactly, so a "/mcp" suffix here would make every PAT exchange and JWT
  // audience check fail (this bit Ads Control the same way).
  return protectedResourceMetadata(TPC_RESOURCE, ["forge:read", "forge:write"]);
}

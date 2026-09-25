import { protectedResourceMetadata } from "@/src/vendor/tpc-auth/resource";
import { TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";

// RFC 9728 protected-resource metadata for the MCP server, so a fresh MCP
// client can discover which authorization server (TPC Auth) to register
// with, with nothing pre-shared.
export async function GET() {
  return protectedResourceMetadata(`${TPC_RESOURCE}/mcp`, [
    "mcp:read",
    "mcp:write",
  ]);
}

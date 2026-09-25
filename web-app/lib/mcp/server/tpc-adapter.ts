// Adapter between the MCP handler's internal ApiKeyScope model ("read" |
// "write" | "admin") and TPC Auth's app-level scopes ("forge:read" |
// "forge:write"), which is all TPC Auth grants for this app's `forge`
// registration. There is no "admin" scope at the IdP: an internal
// requiredScopes of "admin" is treated as requiring "forge:write" — TPC Auth
// doesn't distinguish write from admin for this app today (see feature
// request filed alongside this change).
import type { ApiKeyScope } from "@/lib/api/keys/types";
import { authenticate } from "@/src/vendor/tpc-auth/authenticate";
import { requireScope } from "@/src/vendor/tpc-auth/guards";
import { TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";
import { TpcAuthError, type AuthContext } from "@/src/vendor/tpc-auth/types";

const TPC_SCOPE: Record<ApiKeyScope, string> = {
  read: "forge:read",
  write: "forge:write",
  admin: "forge:write",
};

export type McpAuthResult =
  | { ok: true; userId: string; ctx: AuthContext }
  | { ok: false; status: number; message: string };

/**
 * Authenticate a raw `Authorization` header value against TPC Auth and
 * enforce that the token carries at least one of the requested internal
 * scopes (mapped to their TPC equivalents). Mirrors the shape of the old
 * `verifyMobileAccessTokenOrPat` so callers in handler.ts didn't need to
 * change beyond the import.
 */
export async function authenticateFromHeader(
  authHeader: string | null,
  requiredScopes: ApiKeyScope[],
): Promise<McpAuthResult> {
  const request = new Request("https://internal.invalid/mcp", {
    headers: authHeader ? { authorization: authHeader } : {},
  });

  const ctx = await authenticate(request, { resource: `${TPC_RESOURCE}/mcp` });
  if (!ctx) {
    return { ok: false, status: 401, message: "Missing or invalid access token" };
  }

  const wanted = requiredScopes.map((s) => TPC_SCOPE[s]);
  const hasScope = wanted.some((scope) => ctx.scopes.includes(scope));
  if (!hasScope) {
    try {
      requireScope(ctx, wanted[0] ?? "forge:read");
    } catch (error) {
      if (error instanceof TpcAuthError) {
        return { ok: false, status: error.status, message: error.message };
      }
      throw error;
    }
  }

  return { ok: true, userId: ctx.sub, ctx };
}

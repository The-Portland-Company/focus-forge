import type { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { hashApiKeySecret } from "@/lib/api/keys/utils";
import type { ApiKeyScope } from "@/lib/api/keys/types";

/**
 * Resolve a Forge organization API key from a Bearer Authorization header.
 *
 * This is the server-to-server path for proof uploads: a DevNotes proxy (or any
 * backend) holds an org API key and uploads on behalf of that organization. The
 * key resolves to exactly one organization, so the caller can never target
 * another org's storage account. Returns null when no valid org key is present,
 * letting the caller fall back to a Supabase session.
 */
export interface OrgApiKeyPrincipal {
  organizationId: string;
  scopes: ApiKeyScope[];
  tokenId: string;
}

export async function resolveOrgApiKey(
  request: NextRequest,
): Promise<OrgApiKeyPrincipal | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const hashedKey = hashApiKeySecret(token);
  const admin = getAdminClient();
  const { data } = await admin
    .from("organization_api_keys")
    .select("id, organization_id, scopes, is_active, expires_at")
    .eq("hashed_key", hashedKey)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;

  const row = data as {
    id?: string;
    organization_id?: string;
    scopes?: unknown;
    expires_at?: string | null;
  };

  if (row.expires_at) {
    const expiresMs = Date.parse(row.expires_at);
    if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) return null;
  }

  const organizationId =
    typeof row.organization_id === "string" ? row.organization_id : "";
  const tokenId = typeof row.id === "string" ? row.id : "";
  if (!organizationId || !tokenId) return null;

  const scopes = Array.isArray(row.scopes)
    ? (row.scopes.filter(
        (s: unknown): s is ApiKeyScope => typeof s === "string",
      ) as ApiKeyScope[])
    : [];

  // Best-effort usage audit.
  void admin
    .from("organization_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenId);

  return { organizationId, scopes, tokenId };
}

/** A write-capable org key (write or admin scope) may store proof media. */
export function orgKeyCanWrite(principal: OrgApiKeyPrincipal): boolean {
  return principal.scopes.includes("write") || principal.scopes.includes("admin");
}

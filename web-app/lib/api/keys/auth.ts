import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { hashApiKeySecret } from "./utils";
import type { ApiKeyScope } from "./types";

type AdminProfileRole = "team_member" | "admin" | "super_admin";

export interface AdminSessionPrincipal {
  type: "session";
  userId: string;
  role: AdminProfileRole;
  canAssignElevatedRoles: boolean;
}

export interface AdminPatPrincipal {
  type: "pat";
  userId: string;
  scopes: ApiKeyScope[];
  tokenId: string;
  canAssignElevatedRoles: false;
}

export type AdminProvisioningPrincipal = AdminSessionPrincipal | AdminPatPrincipal;

const authError = (message: string, status = 401) =>
  NextResponse.json(
    {
      error: {
        code: status === 403 ? "forbidden" : "unauthorized",
        message,
      },
    },
    { status },
  );

export async function requireAdminSessionOrPatAdminScope(
  request: NextRequest,
): Promise<{ principal?: AdminProvisioningPrincipal; errorResponse?: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (profile?.role === "admin" || profile?.role === "super_admin") {
      return {
        principal: {
          type: "session",
          userId: session.user.id,
          role: profile.role,
          canAssignElevatedRoles: true,
        },
      };
    }
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { errorResponse: authError("Unauthorized") };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { errorResponse: authError("Unauthorized") };
  }

  const hashedKey = hashApiKeySecret(token);
  const admin = getAdminClient();

  const { data: personalToken } = await admin
    .from("personal_access_tokens")
    .select("id, created_by, scopes, is_active, expires_at")
    .eq("hashed_key", hashedKey)
    .maybeSingle();

  if (personalToken) {
    if (!personalToken.is_active) {
      return { errorResponse: authError("Unauthorized") };
    }

    const expiresMs = Date.parse(String(personalToken.expires_at || ""));
    if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
      return { errorResponse: authError("Unauthorized") };
    }

    const tokenId = typeof personalToken.id === "string" ? personalToken.id : "";
    const createdBy =
      typeof personalToken.created_by === "string" ? personalToken.created_by : "";
    if (!tokenId || !createdBy) {
      return { errorResponse: authError("Unauthorized") };
    }

    const scopes = Array.isArray(personalToken.scopes)
      ? (personalToken.scopes.filter((scope: unknown): scope is ApiKeyScope =>
          typeof scope === "string",
        ) as ApiKeyScope[])
      : [];
    const hasAdminScope = scopes.includes("admin");
    if (!hasAdminScope) {
      return {
        errorResponse: authError("PAT is missing required admin scope.", 403),
      };
    }

    // Best-effort audit trail for token usage.
    void admin
      .from("personal_access_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenId);

    return {
      principal: {
        type: "pat",
        userId: createdBy,
        scopes,
        tokenId,
        canAssignElevatedRoles: false,
      },
    };
  }

  const { data: orgToken } = await admin
    .from("organization_api_keys")
    .select("id")
    .eq("hashed_key", hashedKey)
    .eq("is_active", true)
    .maybeSingle();

  if (orgToken) {
    return {
      errorResponse: authError(
        "Organization API keys are not allowed for this endpoint.",
        403,
      ),
    };
  }

  return { errorResponse: authError("Unauthorized") };
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { hashApiKeySecret } from "@/lib/api/keys/utils";
import { createAnonSupabase } from "@/lib/mobile/api";
import { mapTimeScopes } from "./utils";
import type { TimeScope } from "./types";

export type TimePrincipal =
  | {
      kind: "session";
      userId: string;
      scopes: TimeScope[];
      role: "team_member" | "admin" | "super_admin" | null;
    }
  | {
      kind: "pat";
      userId: string;
      scopes: TimeScope[];
      tokenId: string;
    }
  | {
      kind: "org_token";
      organizationId: string;
      createdBy: string;
      scopes: TimeScope[];
      tokenId: string;
    };

function failure(message: string, status = 401) {
  return NextResponse.json(
    { error: { code: status === 403 ? "forbidden" : "unauthorized", message } },
    { status },
  );
}

function hasRequiredScope(granted: TimeScope[], required: TimeScope[]) {
  if (granted.includes("admin")) {
    return true;
  }

  return required.every((scope) => granted.includes(scope));
}

async function buildSessionPrincipal(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const scopes: TimeScope[] =
    profile?.role === "admin" || profile?.role === "super_admin"
      ? ["read", "write", "admin"]
      : ["read", "write"];

  return {
    userId,
    scopes,
    role:
      profile?.role === "team_member" ||
      profile?.role === "admin" ||
      profile?.role === "super_admin"
        ? profile.role
        : null,
  };
}

export async function requireTimePrincipal(
  request: NextRequest,
  requiredScopes: TimeScope[] = ["read"],
): Promise<{ principal?: TimePrincipal; errorResponse?: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    const sessionPrincipal = await buildSessionPrincipal(session.user.id);

    if (!hasRequiredScope(sessionPrincipal.scopes, requiredScopes)) {
      return {
        errorResponse: failure("Missing required scope.", 403),
      };
    }

    return {
      principal: {
        kind: "session",
        userId: sessionPrincipal.userId,
        scopes: sessionPrincipal.scopes,
        role: sessionPrincipal.role,
      },
    };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { errorResponse: failure("Unauthorized") };
  }

  const [scheme, ...tokenParts] = authHeader.split(" ");
  const token = tokenParts.join(" ").trim();

  if (!scheme || !token) {
    return { errorResponse: failure("Unauthorized") };
  }

  if (scheme.toLowerCase() === "session") {
    const anon = createAnonSupabase();
    const { data, error } = await anon.auth.getUser(token);

    if (error || !data?.user) {
      return { errorResponse: failure("Session token is invalid or expired.") };
    }

    const sessionPrincipal = await buildSessionPrincipal(data.user.id);
    if (!hasRequiredScope(sessionPrincipal.scopes, requiredScopes)) {
      return { errorResponse: failure("Missing required scope.", 403) };
    }

    return {
      principal: {
        kind: "session",
        userId: sessionPrincipal.userId,
        scopes: sessionPrincipal.scopes,
        role: sessionPrincipal.role,
      },
    };
  }

  if (scheme.toLowerCase() !== "bearer") {
    return { errorResponse: failure("Unauthorized") };
  }

  if (!token) {
    return { errorResponse: failure("Unauthorized") };
  }

  const hashedKey = hashApiKeySecret(token);
  const admin = getAdminClient();

  const { data: pat } = await admin
    .from("personal_access_tokens")
    .select("id, created_by, scopes, is_active, expires_at")
    .eq("hashed_key", hashedKey)
    .maybeSingle();

  if (pat) {
    const scopes = mapTimeScopes(pat.scopes);
    const expiresAt = Date.parse(String(pat.expires_at || ""));
    if (!pat.is_active || Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      return { errorResponse: failure("Token is invalid or expired.") };
    }

    if (!hasRequiredScope(scopes, requiredScopes)) {
      return { errorResponse: failure("PAT is missing required scope.", 403) };
    }

    void admin
      .from("personal_access_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", pat.id);

    return {
      principal: {
        kind: "pat",
        userId: String(pat.created_by),
        scopes,
        tokenId: String(pat.id),
      },
    };
  }

  const { data: orgToken } = await admin.rpc("time_get_org_token", {
    p_hashed_key: hashedKey,
  });

  if (!orgToken) {
    return { errorResponse: failure("Unauthorized") };
  }

  const orgScopes = mapTimeScopes(orgToken.scopes);
  const orgExpiresAt = Date.parse(String(orgToken.expires_at || ""));
  if (!orgToken.is_active || Number.isNaN(orgExpiresAt) || orgExpiresAt <= Date.now()) {
    return { errorResponse: failure("Organization token is invalid or expired.") };
  }

  if (!hasRequiredScope(orgScopes, requiredScopes)) {
    return {
      errorResponse: failure("Organization token is missing required scope.", 403),
    };
  }

  void admin.rpc("time_touch_org_token", {
    p_token_id: orgToken.id,
  });

  return {
    principal: {
      kind: "org_token",
      organizationId: String(orgToken.organization_id),
      createdBy: String(orgToken.created_by),
      scopes: orgScopes,
      tokenId: String(orgToken.id),
    },
  };
}

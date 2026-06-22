import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/api/authz";
import { toApiKeyMeta } from "@/lib/api/keys/queries";
import {
  extractPrefixFromSecret,
  generateApiKeySecret,
  hashApiKeySecret,
} from "@/lib/api/keys/utils";
import { normalizeApiKeyCreateRequest } from "@/lib/api/keys/validation";
import type { ApiKeyWithSecret } from "@/lib/api/keys/types";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Authorize and read with the cookie-less admin client: the cookie-bound
    // user client doesn't reliably forward the JWT to PostgREST here
    // (auth.uid() NULL), which would make RLS-scoped profile/membership lookups
    // return nothing and 403 legitimate admins. requireOrgAdmin filters
    // explicitly by the server-verified user.id, so this stays correctly scoped.
    const db = getAdminClient();
    const authz = await requireOrgAdmin(db, user.id, params.id);
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await db
      .from("organization_api_keys")
      .select(
        "id, name, prefix, scopes, expires_at, last_used_at, created_at, created_by, is_active, organization_id",
      )
      .eq("organization_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load organization API keys" },
        { status: 500 },
      );
    }

    return NextResponse.json({ keys: ((data || []) as any[]).map((row) => toApiKeyMeta(row as any)) });
  } catch (error) {
    console.error("GET /api/organizations/[id]/api-keys error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // See GET note — authorize + write via the cookie-less admin client.
    const db = getAdminClient();
    const authz = await requireOrgAdmin(db, user.id, params.id);
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalized = normalizeApiKeyCreateRequest(await request.json());
    if (normalized.error || !normalized.payload) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const { name, scopes, expiresAt } = normalized.payload;
    const secret = generateApiKeySecret("ffk_org_");
    const prefix = extractPrefixFromSecret(secret);
    const hashedKey = hashApiKeySecret(secret);

    const { data: created, error: createError } = await db
      .from("organization_api_keys")
      .insert({
        organization_id: params.id,
        name,
        prefix,
        hashed_key: hashedKey,
        scopes,
        expires_at: expiresAt,
        created_by: user.id,
      } as any)
      .select(
        "id, name, prefix, scopes, expires_at, last_used_at, created_at, created_by, is_active, organization_id",
      )
      .single();

    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message || "Failed to create organization key." },
        { status: 500 },
      );
    }

    const key = toApiKeyMeta(created as any) as ApiKeyWithSecret;
    return NextResponse.json({ key: { ...key, secret } });
  } catch (error) {
    console.error("POST /api/organizations/[id]/api-keys error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

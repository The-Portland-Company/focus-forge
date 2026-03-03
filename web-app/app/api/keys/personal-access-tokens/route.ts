import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toApiKeyMeta } from "@/lib/api/keys/queries";
import { generateApiKeySecret, hashApiKeySecret, extractPrefixFromSecret } from "@/lib/api/keys/utils";
import { normalizeApiKeyCreateRequest } from "@/lib/api/keys/validation";
import type { ApiKeyWithSecret } from "@/lib/api/keys/types";

const MAX_ACTIVE_PATS_PER_USER = 20;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("personal_access_tokens")
      .select(
        "id, name, prefix, scopes, expires_at, last_used_at, created_at, created_by, is_active",
      )
      .eq("created_by", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load personal access tokens" },
        { status: 500 },
      );
    }

    return NextResponse.json({ tokens: (data || []).map((row) => toApiKeyMeta(row as any)) });
  } catch (error) {
    console.error("GET /api/keys/personal-access-tokens error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const normalized = normalizeApiKeyCreateRequest(await request.json());
    if (normalized.error || !normalized.payload) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const { name, scopes, expiresAt } = normalized.payload;
    const { count, error: countError } = await supabase
      .from("personal_access_tokens")
      .select("id", { count: "exact", head: true })
      .eq("created_by", session.user.id)
      .eq("is_active", true);

    if (countError) {
      return NextResponse.json(
        { error: "Unable to validate token quota." },
        { status: 500 },
      );
    }

    if ((count || 0) >= MAX_ACTIVE_PATS_PER_USER) {
      return NextResponse.json(
        { error: "Maximum active PAT limit reached (20). Revoke one first." },
        { status: 409 },
      );
    }

    const secret = generateApiKeySecret("ffk_pat_");
    const prefix = extractPrefixFromSecret(secret);
    const hashedKey = hashApiKeySecret(secret);

    const { data: created, error: createError } = await supabase
      .from("personal_access_tokens")
      .insert({
        name,
        prefix,
        hashed_key: hashedKey,
        scopes,
        expires_at: expiresAt,
        created_by: session.user.id,
      } as any)
      .select("id, name, prefix, scopes, expires_at, last_used_at, created_at, created_by, is_active")
      .single();

    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message || "Failed to create token." },
        { status: 500 },
      );
    }

    const key = toApiKeyMeta(created as any) as ApiKeyWithSecret;
    return NextResponse.json({ key: { ...key, secret } });
  } catch (error) {
    console.error("POST /api/keys/personal-access-tokens error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

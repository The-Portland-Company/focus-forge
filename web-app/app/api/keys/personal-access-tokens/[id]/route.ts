import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    // getUser() revalidates + refreshes the token so the RLS update below runs
    // with a valid auth.uid() (stale tokens otherwise fail can_manage checks).
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    // Service client scoped to the verified user.id — the cookie-bound user
    // client does not reliably forward the JWT to PostgREST here (auth.uid()
    // NULL), so RLS-scoped reads/updates would silently no-op.
    const db = createServiceClient();
    const { data: token, error: tokenError } = await db
      .from("personal_access_tokens")
      .select("id")
      .eq("id", id)
      .eq("created_by", user.id)
      .eq("is_active", true)
      .single();

    if (tokenError || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const { error: revokeError } = await db
      .from("personal_access_tokens")
      .update({ is_active: false })
      .eq("id", id)
      .eq("created_by", user.id);

    if (revokeError) {
      return NextResponse.json(
        { error: "Failed to revoke token" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/keys/personal-access-tokens/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

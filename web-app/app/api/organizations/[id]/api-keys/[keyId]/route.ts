import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgAdmin } from "@/lib/api/authz";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; keyId: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authz = await requireOrgAdmin(supabase, session.user.id, params.id);
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: key, error: keyError } = await supabase
      .from("organization_api_keys")
      .select("id")
      .eq("id", params.keyId)
      .eq("organization_id", params.id)
      .eq("is_active", true)
      .single();

    if (keyError || !key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const { error: revokeError } = await supabase
      .from("organization_api_keys")
      .update({ is_active: false })
      .eq("id", params.keyId)
      .eq("organization_id", params.id);

    if (revokeError) {
      return NextResponse.json(
        { error: "Failed to revoke organization key" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/organizations/[id]/api-keys/[keyId] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

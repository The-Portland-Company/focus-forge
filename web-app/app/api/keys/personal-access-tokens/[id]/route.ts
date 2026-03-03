import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
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

    const { id } = params;
    const { data: token, error: tokenError } = await supabase
      .from("personal_access_tokens")
      .select("id")
      .eq("id", id)
      .eq("created_by", session.user.id)
      .eq("is_active", true)
      .single();

    if (tokenError || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const { error: revokeError } = await supabase
      .from("personal_access_tokens")
      .update({ is_active: false })
      .eq("id", id)
      .eq("created_by", session.user.id);

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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// DELETE: revoke a share link (soft — sets revoked_at).
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string; shareId: string }> },
) {
  try {
    const { id: projectId, shareId } = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // RLS (project_shares_member_all) enforces that only project members can
    // update rows for this project.
    const { data, error } = await supabase
      .from("project_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", shareId)
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (!data) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke project share:", error);
    return NextResponse.json(
      { error: "Failed to revoke share" },
      { status: 500 },
    );
  }
}

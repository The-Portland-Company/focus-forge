import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";

// GET /api/trash — all soft-deleted entities visible to the user
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

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    const trash = await adapter.getTrash();
    return NextResponse.json(trash);
  } catch (error) {
    console.error("GET /api/trash error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trash" },
      { status: 500 },
    );
  }
}

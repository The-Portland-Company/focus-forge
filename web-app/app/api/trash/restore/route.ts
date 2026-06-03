import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";

// POST /api/trash/restore { batchId } — restore a delete batch exactly as it was
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

    const body = await request.json();
    const batchId = body?.batchId;
    if (!batchId || typeof batchId !== "string") {
      return NextResponse.json({ error: "batchId required" }, { status: 400 });
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    const { restored } = await adapter.restoreEntity(batchId);
    return NextResponse.json({ success: true, restored });
  } catch (error) {
    console.error("POST /api/trash/restore error:", error);
    return NextResponse.json(
      { error: "Failed to restore" },
      { status: 500 },
    );
  }
}

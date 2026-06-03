import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";

const ENTITY_TYPES = new Set(["organization", "project", "section", "task"]);

// POST /api/trash/purge { entityType, entityId, confirm: true }
// Permanently deletes (hard delete, FK cascade wipes children). Irreversible.
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
    const { entityType, entityId, confirm } = body || {};

    if (!ENTITY_TYPES.has(entityType) || typeof entityId !== "string") {
      return NextResponse.json(
        { error: "Valid entityType and entityId required" },
        { status: 400 },
      );
    }
    if (confirm !== true) {
      return NextResponse.json(
        { error: "Permanent deletion requires confirm: true" },
        { status: 400 },
      );
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    await adapter.purgeEntity(entityType, entityId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/trash/purge error:", error);
    return NextResponse.json({ error: "Failed to purge" }, { status: 500 });
  }
}

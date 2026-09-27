import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

// GET /api/trash — all soft-deleted entities visible to the user
export async function GET() {
  try {
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

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

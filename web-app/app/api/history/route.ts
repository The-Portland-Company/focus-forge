import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";

// GET /api/history?entityType=task&entityId=...  (single entity history)
// GET /api/history?projectId=...                 (scope history for timeline)
// GET /api/history?organizationId=...
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const entityType = params.get("entityType");
    const entityId = params.get("entityId");
    const projectId = params.get("projectId");
    const organizationId = params.get("organizationId");

    const adapter = new SupabaseAdapter(supabase, session.user.id);

    if (entityType && entityId) {
      const events = await adapter.getEntityHistory(entityType, entityId);
      return NextResponse.json({ events });
    }

    if (projectId || organizationId) {
      const events = await adapter.getScopeHistory({
        projectId: projectId || undefined,
        organizationId: organizationId || undefined,
      });
      return NextResponse.json({ events });
    }

    return NextResponse.json(
      { error: "Provide entityType+entityId, projectId, or organizationId" },
      { status: 400 },
    );
  } catch (error) {
    console.error("GET /api/history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 },
    );
  }
}

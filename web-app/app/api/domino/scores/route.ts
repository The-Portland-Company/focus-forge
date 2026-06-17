import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { computeTaskDominoScores } from "@/lib/domino/scoring";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);

    let organizationId: string | null =
      typeof body?.organization_id === "string"
        ? body.organization_id
        : typeof body?.organizationId === "string"
          ? body.organizationId
          : null;
    if (!organizationId) {
      const orgs = await adapter.getOrganizations();
      organizationId = orgs?.[0]?.id || null;
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id is required" },
        { status: 400 },
      );
    }

    const graph = await adapter.getDominoGraphData(organizationId);
    const scores = computeTaskDominoScores({
      stakes: graph.stakes,
      edges: graph.edges,
      links: graph.links,
      taskEffortMinutes: graph.taskEffortMinutes,
    });

    return NextResponse.json({ scores });
  } catch (error) {
    console.error("Error computing domino scores:", error);
    return NextResponse.json(
      { error: "Failed to compute domino scores" },
      { status: 500 },
    );
  }
}

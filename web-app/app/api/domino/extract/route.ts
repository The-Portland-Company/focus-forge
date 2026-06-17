import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { extractStakesWithAI } from "@/lib/domino/ai";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 },
      );
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

    const projectId =
      typeof body?.project_id === "string"
        ? body.project_id
        : typeof body?.projectId === "string"
          ? body.projectId
          : null;

    const proposal = await extractStakesWithAI({
      text,
      organizationId,
      userId: auth.user.id,
      projectId,
    });

    return NextResponse.json(proposal);
  } catch (error) {
    console.error("Error extracting stakes:", error);
    return NextResponse.json(
      { error: "Failed to extract stakes" },
      { status: 500 },
    );
  }
}

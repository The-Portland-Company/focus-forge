import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProjectAiExportForUser } from "@/lib/project-ai-export"
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

    const payload = await getProjectAiExportForUser(params.id, session.user.id)

    if (!payload) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error("Error building project AI export:", error)
    return NextResponse.json(
      { error: "Failed to build project AI export." },
      { status: 500 },
    )
  }
}

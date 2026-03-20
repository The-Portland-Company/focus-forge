import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProjectAiExportForUser } from "@/lib/project-ai-export"

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params
    const supabase = await createClient()
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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

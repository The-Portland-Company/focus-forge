import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { distillPlaybookFromMemories } from "@/lib/ai-memory/playbook"

// GET /api/ai-memory/playbooks — all playbook versions for the user
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = getAdminClient()
    const { data, error } = await admin
      .from("ai_playbooks")
      .select("*")
      .eq("user_id", session.user.id)
      .order("version", { ascending: false })

    if (error) throw new Error(error.message)

    // Derive source_memory_count and is_active (latest version per type).
    const maxVersionByType = new Map<string, number>()
    for (const p of data ?? []) {
      const cur = maxVersionByType.get(p.playbook_type) ?? 0
      if (p.version > cur) maxVersionByType.set(p.playbook_type, p.version)
    }

    const playbooks = (data ?? []).map((p: any) => ({
      ...p,
      source_memory_count: Array.isArray(p.source_memory_ids)
        ? p.source_memory_ids.length
        : 0,
      is_active:
        p.status === "active" &&
        p.version === maxVersionByType.get(p.playbook_type),
    }))

    return NextResponse.json({ playbooks })
  } catch (error) {
    console.error("GET /api/ai-memory/playbooks error:", error)
    return NextResponse.json(
      { error: "Failed to fetch playbooks" },
      { status: 500 },
    )
  }
}

// POST /api/ai-memory/playbooks — distill a new playbook from memories
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { playbookType } = body ?? {}
    if (!playbookType) {
      return NextResponse.json(
        { error: "playbookType is required" },
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    const playbook = await distillPlaybookFromMemories(admin, {
      userId: session.user.id,
      playbookType,
    })

    return NextResponse.json({ playbook })
  } catch (error) {
    console.error("POST /api/ai-memory/playbooks error:", error)
    const message =
      error instanceof Error ? error.message : "Failed to create playbook"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

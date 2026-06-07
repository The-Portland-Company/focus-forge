import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { recordAIMemoryEvent } from "@/lib/ai-memory/write"

// PUT /api/ai-memory/playbooks/[id] — user edits content; inserts a NEW version
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { contentMarkdown } = body ?? {}
    if (typeof contentMarkdown !== "string") {
      return NextResponse.json(
        { error: "contentMarkdown is required" },
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    const userId = session.user.id

    const { data: base, error: fetchError } = await admin
      .from("ai_playbooks")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle()

    if (fetchError) throw new Error(fetchError.message)
    if (!base) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Determine the next version for this playbook type.
    const { data: latest } = await admin
      .from("ai_playbooks")
      .select("version")
      .eq("user_id", userId)
      .eq("playbook_type", base.playbook_type)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (latest?.version ?? base.version) + 1

    const { data, error } = await admin
      .from("ai_playbooks")
      .insert({
        user_id: userId,
        organization_id: base.organization_id ?? null,
        playbook_type: base.playbook_type,
        version: nextVersion,
        content_markdown: contentMarkdown,
        source_memory_ids: base.source_memory_ids ?? [],
        status: "active",
        created_by: "user",
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    try {
      await recordAIMemoryEvent(admin, {
        user_id: userId,
        source_type: "manual",
        source_id: data.id,
        event_type: "playbook_edited",
        before_json: { version: base.version },
        after_json: { version: nextVersion },
        reason: "manual",
      })
    } catch (e) {
      console.error("playbook edit event record failed:", e)
    }

    return NextResponse.json({
      playbook: {
        ...data,
        source_memory_count: Array.isArray(data.source_memory_ids)
          ? data.source_memory_ids.length
          : 0,
        is_active: true,
      },
    })
  } catch (error) {
    console.error("PUT /api/ai-memory/playbooks/[id] error:", error)
    return NextResponse.json(
      { error: "Failed to update playbook" },
      { status: 500 },
    )
  }
}

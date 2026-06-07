import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { recordAIMemoryEvent } from "@/lib/ai-memory/write"
import { generateEmbedding } from "@/lib/ai-core/embeddings"

// PUT /api/ai-memory/memories/[id] — edit / archive a memory
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

    const admin = getAdminClient()
    const userId = session.user.id

    const { data: existing, error: fetchError } = await admin
      .from("ai_memories")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle()

    if (fetchError) throw new Error(fetchError.message)
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const body = await request.json()
    const { memoryType, inputText, outcome, normalizedSummary, status } =
      body ?? {}

    const update: Record<string, unknown> = {}
    if (memoryType !== undefined) update.memory_type = memoryType
    if (normalizedSummary !== undefined)
      update.normalized_summary = normalizedSummary
    if (outcome !== undefined) update.outcome_json = outcome
    if (status !== undefined) update.status = status

    const inputChanged =
      inputText !== undefined && inputText !== existing.input_text
    if (inputText !== undefined) update.input_text = inputText
    if (inputChanged) {
      update.embedding = await generateEmbedding(inputText)
    }

    const { data, error } = await admin
      .from("ai_memories")
      .update(update)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) throw new Error(error.message)

    // Record event (best-effort).
    try {
      const eventType =
        status === "archived" ? "memory_archived" : "memory_edited"
      await recordAIMemoryEvent(admin, {
        user_id: userId,
        source_type: "manual",
        source_id: id,
        event_type: eventType,
        before_json: {
          input_text: existing.input_text,
          status: existing.status,
        },
        after_json: { input_text: data.input_text, status: data.status },
        reason: "manual",
      })
    } catch (e) {
      console.error("memory edit event record failed:", e)
    }

    return NextResponse.json({ memory: data })
  } catch (error) {
    console.error("PUT /api/ai-memory/memories/[id] error:", error)
    return NextResponse.json(
      { error: "Failed to update memory" },
      { status: 500 },
    )
  }
}

// DELETE /api/ai-memory/memories/[id] — soft-delete
export async function DELETE(
  _request: NextRequest,
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

    const admin = getAdminClient()
    const userId = session.user.id

    const { error } = await admin
      .from("ai_memories")
      .update({ status: "deleted" })
      .eq("id", id)
      .eq("user_id", userId)

    if (error) throw new Error(error.message)

    try {
      await recordAIMemoryEvent(admin, {
        user_id: userId,
        source_type: "manual",
        source_id: id,
        event_type: "memory_deleted",
        reason: "manual",
      })
    } catch (e) {
      console.error("memory delete event record failed:", e)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/ai-memory/memories/[id] error:", error)
    return NextResponse.json(
      { error: "Failed to delete memory" },
      { status: 500 },
    )
  }
}

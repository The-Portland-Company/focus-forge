import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { recordAIMemoryEvent } from "@/lib/ai-memory/write"
import { generateEmbedding } from "@/lib/ai-core/embeddings"

// GET /api/ai-memory/memories — all non-deleted memories for the user
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
      .from("ai_memories")
      .select("*")
      .eq("user_id", session.user.id)
      .neq("status", "deleted")
      .order("updated_at", { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ memories: data ?? [] })
  } catch (error) {
    console.error("GET /api/ai-memory/memories error:", error)
    return NextResponse.json(
      { error: "Failed to fetch memories" },
      { status: 500 },
    )
  }
}

// POST /api/ai-memory/memories — manually create a memory
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
    const { memoryType, inputText, outcome, normalizedSummary } = body ?? {}

    if (!memoryType || !inputText) {
      return NextResponse.json(
        { error: "memoryType and inputText are required" },
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    const userId = session.user.id

    // Record the originating event (best-effort).
    let sourceEventId: string | null = null
    try {
      const evt = await recordAIMemoryEvent(admin, {
        user_id: userId,
        source_type: "manual",
        event_type: "memory_created",
        after_json: { input_text: inputText, outcome: outcome ?? null },
        reason: "manual",
      })
      sourceEventId = evt.id
    } catch (e) {
      console.error("manual memory event record failed:", e)
    }

    const embedding = await generateEmbedding(inputText)

    const { data, error } = await admin
      .from("ai_memories")
      .insert({
        user_id: userId,
        organization_id: null,
        memory_type: memoryType,
        input_text: inputText,
        normalized_summary: normalizedSummary || inputText,
        outcome_json: outcome ?? {},
        source_event_id: sourceEventId,
        source_type: "manual_memory",
        weight: 2,
        confidence: 0.7,
        source_count: 1,
        embedding,
        status: "active",
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ memory: data })
  } catch (error) {
    console.error("POST /api/ai-memory/memories error:", error)
    return NextResponse.json(
      { error: "Failed to create memory" },
      { status: 500 },
    )
  }
}

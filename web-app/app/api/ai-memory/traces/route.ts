import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"

// GET /api/ai-memory/traces — recent 50 decision traces for the user
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
      .from("ai_decision_traces")
      .select(
        "id, source_type, ai_call_type, input_text, final_output_json, overridden_by_rule, created_at",
      )
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)

    const traces = (data ?? []).map((t: any) => ({
      id: t.id,
      source_type: t.source_type,
      ai_call_type: t.ai_call_type,
      input_text: t.input_text,
      final_output_json: t.final_output_json,
      approved: false,
      corrected: false,
      overridden_by_rule: t.overridden_by_rule ?? false,
      created_at: t.created_at,
    }))

    return NextResponse.json({ traces })
  } catch (error) {
    console.error("GET /api/ai-memory/traces error:", error)
    return NextResponse.json(
      { error: "Failed to fetch traces" },
      { status: 500 },
    )
  }
}

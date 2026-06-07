import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"

// GET /api/ai-memory/traces/[id] — full detail for one decision trace
export async function GET(
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

    const { data: trace, error } = await admin
      .from("ai_decision_traces")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!trace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Resolve matched rules.
    let matchedRules: Array<{ id: string; name: string }> = []
    const matchedRuleIds: string[] = Array.isArray(trace.matched_rule_ids)
      ? trace.matched_rule_ids
      : []
    if (matchedRuleIds.length > 0) {
      const { data: rules } = await admin
        .from("email_rules")
        .select("id, name")
        .in("id", matchedRuleIds)
      matchedRules = (rules ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
      }))
    }

    // Resolve injected memories.
    let injectedMemories: Array<{ id: string; normalized_summary: string }> = []
    const selectedMemoryIds: string[] = Array.isArray(trace.selected_memory_ids)
      ? trace.selected_memory_ids
      : []
    if (selectedMemoryIds.length > 0) {
      const { data: mems } = await admin
        .from("ai_memories")
        .select("id, normalized_summary, memory_type")
        .in("id", selectedMemoryIds)
      injectedMemories = (mems ?? []).map((m: any) => ({
        id: m.id,
        normalized_summary: m.normalized_summary,
        memory_type: m.memory_type,
      }))
    }

    // Resolve playbook version.
    let playbookVersion: number | null = null
    if (trace.selected_playbook_id) {
      const { data: pb } = await admin
        .from("ai_playbooks")
        .select("version")
        .eq("id", trace.selected_playbook_id)
        .maybeSingle()
      playbookVersion = pb?.version ?? null
    }

    return NextResponse.json({
      trace: {
        id: trace.id,
        source_type: trace.source_type,
        ai_call_type: trace.ai_call_type,
        input_text: trace.input_text,
        final_output_json: trace.final_output_json,
        ai_output_json: trace.ai_output_json,
        approved: false,
        corrected: false,
        overridden_by_rule: trace.overridden_by_rule ?? false,
        override_reason: trace.override_reason,
        prompt_context_summary: trace.prompt_context_summary,
        matched_rule_ids: matchedRuleIds,
        matched_rules: matchedRules,
        selected_memory_ids: selectedMemoryIds,
        injected_memories: injectedMemories,
        playbook_version: playbookVersion,
        created_at: trace.created_at,
      },
    })
  } catch (error) {
    console.error("GET /api/ai-memory/traces/[id] error:", error)
    return NextResponse.json(
      { error: "Failed to fetch trace" },
      { status: 500 },
    )
  }
}

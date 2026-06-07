// Decision-trace writer. Records a row in ai_decision_traces capturing the
// inputs/outputs of an AI call so the UI can show what the model saw and why
// the final output may differ (deterministic rule overrides).
//
// NOTE: this file is owned by Agent 3. It must NOT depend on any mutable
// internals of the Agent-2 service layer beyond the public types.

export interface RecordDecisionTraceInput {
  userId: string
  organizationId?: string | null
  sourceType: string
  sourceId?: string | null
  aiCallType: string
  inputText: string
  selectedMemoryIds?: string[] | null
  selectedPlaybookId?: string | null
  matchedRuleIds?: string[] | null
  promptContextSummary?: string | null
  aiOutput?: Record<string, unknown> | null
  finalOutput?: Record<string, unknown> | null
  overriddenByRule?: boolean
  overrideReason?: string | null
  modelProvider?: string | null
  modelName?: string | null
}

/**
 * Inserts a single ai_decision_traces row. Resilient: never throws — returns
 * the inserted id or null. Callers should still wrap in try/catch defensively.
 */
export async function recordDecisionTrace(
  supabase: any,
  input: RecordDecisionTraceInput,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("ai_decision_traces")
      .insert({
        user_id: input.userId,
        organization_id: input.organizationId ?? null,
        source_type: input.sourceType,
        source_id: input.sourceId ?? null,
        ai_call_type: input.aiCallType,
        input_text: input.inputText ?? null,
        selected_memory_ids: input.selectedMemoryIds ?? [],
        selected_playbook_id: input.selectedPlaybookId ?? null,
        matched_rule_ids: input.matchedRuleIds ?? [],
        prompt_context_summary: input.promptContextSummary ?? null,
        ai_output_json: input.aiOutput ?? null,
        final_output_json: input.finalOutput ?? null,
        overridden_by_rule: input.overriddenByRule ?? false,
        override_reason: input.overrideReason ?? null,
        model_provider: input.modelProvider ?? null,
        model_name: input.modelName ?? null,
      })
      .select("id")
      .single()

    if (error) {
      console.error("recordDecisionTrace insert error:", error.message)
      return null
    }

    return (data?.id as string) ?? null
  } catch (err) {
    console.error("recordDecisionTrace failed:", err)
    return null
  }
}

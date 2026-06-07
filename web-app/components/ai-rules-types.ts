// Light local interfaces matching the JSON shapes returned by the
// /api/ai-memory/* endpoints. Column names are snake_case as stored in the DB.

export type AIMemorySourceType =
  | "corrected"
  | "approved"
  | "manual"
  | "ai_suggested"
  | "repeated";

export interface AIMemory {
  id: string;
  normalized_summary: string;
  memory_type: string;
  input_text: string | null;
  outcome_json: Record<string, unknown> | null;
  source_type: AIMemorySourceType | string;
  confidence: number | null;
  weight: number | null;
  source_count: number | null;
  last_used_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AIPlaybook {
  id: string;
  playbook_type: string;
  version: number;
  content_markdown: string;
  source_memory_count: number | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AIDecisionTraceSummary {
  id: string;
  source_type: string | null;
  ai_call_type: string | null;
  input_text: string | null;
  final_output_json: Record<string, unknown> | null;
  approved: boolean | null;
  corrected: boolean | null;
  overridden_by_rule: boolean | null;
  created_at: string;
}

export interface AIDecisionTraceMemoryRow {
  id: string;
  normalized_summary: string;
  memory_type?: string;
}

export interface AIDecisionTraceDetail extends AIDecisionTraceSummary {
  matched_rule_ids: string[] | null;
  matched_rules?: Array<{ id: string; name: string }> | null;
  playbook_version: number | null;
  selected_memory_ids: string[] | null;
  injected_memories?: AIDecisionTraceMemoryRow[] | null;
  prompt_context_summary: string | null;
  ai_output_json: Record<string, unknown> | null;
  override_reason: string | null;
  correction?: Record<string, unknown> | null;
}

export const MEMORY_SOURCE_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  corrected: {
    label: "You Corrected",
    className: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  approved: {
    label: "You Approved",
    className: "bg-green-500/15 text-green-300 border-green-500/30",
  },
  manual: {
    label: "Manual",
    className: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  ai_suggested: {
    label: "AI Suggested",
    className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  },
  repeated: {
    label: "Repeated",
    className: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  // DB source_type values (ai_memories.source_type) — keep in sync with the API.
  user_corrected: {
    label: "You Corrected",
    className: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  user_approved: {
    label: "You Approved",
    className: "bg-green-500/15 text-green-300 border-green-500/30",
  },
  manual_memory: {
    label: "Manual",
    className: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  repeated_pattern: {
    label: "Repeated",
    className: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  imported: {
    label: "Imported",
    className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  },
};

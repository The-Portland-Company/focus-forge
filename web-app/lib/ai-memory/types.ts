// ─── Enums / string unions ────────────────────────────────────────────────────

export const MEMORY_TYPES = [
  "task_categorization",
  "email_categorization",
  "priority_judgment",
  "estimate_judgment",
  "project_routing",
  "due_date_judgment",
  "urgency_judgment",
  "rule_precedent",
  "general_preference",
] as const

export type MemoryType = (typeof MEMORY_TYPES)[number]

export const MEMORY_SOURCE_TYPES = [
  "user_corrected",
  "user_approved",
  "manual_memory",
  "repeated_pattern",
  "ai_suggested",
  "imported",
] as const

export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number]

export const EVENT_TYPES = [
  "ai_suggested_task_category",
  "user_approved_task_category",
  "user_corrected_task_category",
  "user_moved_task_project",
  "user_changed_priority",
  "user_changed_estimate",
  "user_changed_due_date",
  "user_changed_category",
  "email_taskified",
  "email_classified",
  "email_rule_created",
  "email_rule_approved",
  "memory_created",
  "memory_edited",
  "memory_deleted",
  "memory_archived",
  "playbook_generated",
  "playbook_edited",
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const MEMORY_STATUSES = ["active", "archived", "deleted"] as const
export type MemoryStatus = (typeof MEMORY_STATUSES)[number]

export const PLAYBOOK_TYPES = [
  "task_categorization",
  "email_categorization",
  "project_routing",
  "priority_estimation",
  "global",
] as const

export type PlaybookType = (typeof PLAYBOOK_TYPES)[number]

// ─── Core DB shapes ───────────────────────────────────────────────────────────

export interface AIMemory {
  id: string
  user_id: string
  organization_id: string | null
  memory_type: MemoryType
  input_text: string
  normalized_summary: string
  outcome_json: Record<string, unknown>
  source_event_id: string | null
  source_type: MemorySourceType
  weight: number
  confidence: number
  source_count: number
  status: MemoryStatus
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface ProposedAIMemory {
  user_id: string
  organization_id: string | null
  memory_type: MemoryType
  input_text: string
  normalized_summary: string
  outcome_json: Record<string, unknown>
  source_event_id: string | null
  source_type: MemorySourceType
  weight: number
  confidence: number
}

// ─── Event input shape (what callers pass to recordAIMemoryEvent) ─────────────

export interface AIMemoryEventInput {
  user_id: string
  organization_id?: string | null
  source_type: "task" | "email" | "rule" | "project" | "manual" | "ai_decision"
  source_id?: string | null
  event_type: EventType
  before_json?: Record<string, unknown> | null
  after_json?: Record<string, unknown> | null
  reason: "ai_suggested" | "user_approved" | "user_corrected" | "manual" | "system"
}

// ─── Retrieved shape (RPC result + mapped) ────────────────────────────────────

export interface RetrievedAIMemory {
  id: string
  memory_type: MemoryType
  input_text: string
  normalized_summary: string
  outcome_json: Record<string, unknown>
  source_type: MemorySourceType
  weight: number
  confidence: number
  source_count: number
  similarity: number
  score: number
}

// ─── Playbook ─────────────────────────────────────────────────────────────────

export interface AIPlaybook {
  id: string
  user_id: string
  organization_id: string | null
  playbook_type: PlaybookType
  version: number
  content_markdown: string
  source_memory_ids: string[]
  status: string
  created_by: "ai" | "user" | "system"
  created_at: string
  updated_at: string
}

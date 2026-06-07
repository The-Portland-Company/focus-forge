import { generateEmbedding } from "@/lib/ai-core/embeddings"
import { redactSensitiveMemoryText } from "@/lib/ai-core/redact"
import type {
  AIMemory,
  AIMemoryEventInput,
  EventType,
  MemorySourceType,
  MemoryType,
  ProposedAIMemory,
} from "./types"

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMORY_MODEL = "gpt-4.1-mini"

/** Minimum cosine similarity to consider two memories the same pattern. */
const MERGE_SIMILARITY_THRESHOLD = 0.88

/** Weight cap to prevent runaway reinforcement. */
const MAX_WEIGHT = 10.0

/** Weight delta applied when merging into an existing memory. */
const MERGE_WEIGHT_DELTA = 0.5

/** Default weights by source type. */
const SOURCE_WEIGHTS: Record<MemorySourceType, number> = {
  user_corrected: 2.0,
  manual_memory: 2.0,
  repeated_pattern: 2.0,
  user_approved: 1.0,
  ai_suggested: 0.3,
  imported: 1.0,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventTypeToMemoryType(eventType: EventType): MemoryType {
  switch (eventType) {
    case "user_approved_task_category":
    case "user_corrected_task_category":
    case "ai_suggested_task_category":
    case "user_changed_category":
      return "task_categorization"

    case "user_moved_task_project":
      return "project_routing"

    case "user_changed_priority":
      return "priority_judgment"

    case "user_changed_estimate":
      return "estimate_judgment"

    case "user_changed_due_date":
      return "due_date_judgment"

    case "email_taskified":
    case "email_classified":
      return "email_categorization"

    case "email_rule_created":
    case "email_rule_approved":
      return "rule_precedent"

    case "memory_created":
    case "memory_edited":
      return "general_preference"

    default:
      return "general_preference"
  }
}

function eventTypeToSourceType(reason: AIMemoryEventInput["reason"]): MemorySourceType {
  switch (reason) {
    case "user_corrected":
      return "user_corrected"
    case "user_approved":
      return "user_approved"
    case "manual":
      return "manual_memory"
    case "ai_suggested":
      return "ai_suggested"
    default:
      return "ai_suggested"
  }
}

function extractOutcomeFields(afterJson: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!afterJson) return {}
  const decisionKeys = [
    "organization",
    "organization_id",
    "project",
    "project_id",
    "category",
    "priority",
    "estimate",
    "estimate_minutes",
    "due_date",
    "status",
    "classification",
    "rule",
  ]
  const result: Record<string, unknown> = {}
  for (const key of decisionKeys) {
    if (key in afterJson) {
      result[key] = afterJson[key]
    }
  }
  return result
}

function outcomesCompatible(
  existing: Record<string, unknown>,
  proposed: Record<string, unknown>,
): boolean {
  const existingKeys = Object.keys(existing)
  const proposedKeys = Object.keys(proposed)
  const sharedKeys = existingKeys.filter((k) => proposedKeys.includes(k))
  if (sharedKeys.length === 0) return true
  // Compatible if all shared decision fields agree
  return sharedKeys.every((k) => String(existing[k]) === String(proposed[k]))
}

async function callOpenAIForSummary(
  inputText: string,
  afterJson: Record<string, unknown>,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured")
  }

  const schema = {
    name: "memory_summary",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        normalized_summary: { type: "string" },
      },
      required: ["normalized_summary"],
    },
  } as const

  const systemPrompt = `You create one-line generalizations of user behavior patterns for an AI memory system.
Given a specific task/email/action and its outcome, produce a brief, generalized rule that captures the pattern.
Generalize proper nouns to their category (e.g. "client website emergencies" not the specific client name).
Keep it under 20 words. Output JSON only.`

  const userContent = `Input: ${inputText}\nOutcome: ${JSON.stringify(afterJson)}`

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MEMORY_MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: schema,
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI summary request failed (${response.status}): ${errorText}`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  if (!content || typeof content !== "string") {
    throw new Error("Summary response missing JSON content")
  }

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error("Summary returned invalid JSON")
  }

  return typeof parsed.normalized_summary === "string"
    ? parsed.normalized_summary
    : ""
}

// ─── Exported functions ───────────────────────────────────────────────────────

export async function recordAIMemoryEvent(
  supabase: any,
  event: AIMemoryEventInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("ai_memory_events")
    .insert({
      user_id: event.user_id,
      organization_id: event.organization_id ?? null,
      source_type: event.source_type,
      source_id: event.source_id ?? null,
      event_type: event.event_type,
      before_json: event.before_json ?? null,
      after_json: event.after_json ?? null,
      reason: event.reason,
    })
    .select("id")
    .single()

  if (error) {
    throw new Error(`Failed to record AI memory event: ${error.message}`)
  }

  return { id: data.id }
}

export function shouldCreateMemoryFromEvent(event: AIMemoryEventInput): boolean {
  const createableTypes: EventType[] = [
    "user_approved_task_category",
    "user_corrected_task_category",
    "user_moved_task_project",
    "user_changed_priority",
    "user_changed_estimate",
    "user_changed_due_date",
    "user_changed_category",
    "email_taskified",
    "email_rule_approved",
    "memory_created",
  ]
  return createableTypes.includes(event.event_type)
}

export async function buildMemoryFromEvent(
  supabase: any,
  event: AIMemoryEventInput,
): Promise<ProposedAIMemory> {
  const rawInputText = event.before_json
    ? JSON.stringify(event.before_json)
    : event.source_id ?? event.event_type

  const inputText = redactSensitiveMemoryText(rawInputText)
  const outcomeJson = extractOutcomeFields(event.after_json)
  const memoryType = eventTypeToMemoryType(event.event_type)
  const sourceType = eventTypeToSourceType(event.reason)

  const rawSummary = await callOpenAIForSummary(inputText, outcomeJson)
  const normalizedSummary = redactSensitiveMemoryText(rawSummary)

  return {
    user_id: event.user_id,
    organization_id: event.organization_id ?? null,
    memory_type: memoryType,
    input_text: inputText,
    normalized_summary: normalizedSummary,
    outcome_json: outcomeJson,
    source_event_id: null, // will be set after event is recorded if needed
    source_type: sourceType,
    weight: SOURCE_WEIGHTS[sourceType] ?? 1.0,
    confidence: sourceType === "user_corrected" ? 0.9 : sourceType === "user_approved" ? 0.75 : 0.5,
  }
}

export async function mergeSimilarMemoryOrInsert(
  supabase: any,
  proposed: ProposedAIMemory,
): Promise<AIMemory> {
  const embedding = await generateEmbedding(proposed.input_text)

  // Search for similar existing memories
  const { data: matches, error: rpcError } = await supabase.rpc("match_ai_memories", {
    p_user_id: proposed.user_id,
    p_query_embedding: embedding,
    p_memory_types: [proposed.memory_type],
    p_organization_id: proposed.organization_id ?? null,
    p_limit: 3,
  })

  if (rpcError) {
    throw new Error(`match_ai_memories RPC failed: ${rpcError.message}`)
  }

  const topMatch = matches?.[0]

  if (topMatch && topMatch.similarity >= MERGE_SIMILARITY_THRESHOLD) {
    const compatible = outcomesCompatible(
      topMatch.outcome_json ?? {},
      proposed.outcome_json,
    )

    if (compatible) {
      // Merge: reinforce the existing memory
      const newWeight = Math.min((topMatch.weight ?? 1) + MERGE_WEIGHT_DELTA, MAX_WEIGHT)
      const newConfidence = Math.min((topMatch.confidence ?? 0.5) + 0.1, 0.99)

      const { data: updated, error: updateError } = await supabase
        .from("ai_memories")
        .update({
          source_count: (topMatch.source_count ?? 1) + 1,
          weight: newWeight,
          confidence: newConfidence,
          embedding,
          updated_at: new Date().toISOString(),
        })
        .eq("id", topMatch.id)
        .select()
        .single()

      if (updateError) {
        throw new Error(`Failed to merge memory: ${updateError.message}`)
      }

      return updated as AIMemory
    } else {
      // Similar but conflicting — insert new with reduced confidence
      return await insertNewMemory(supabase, proposed, embedding, 0.4)
    }
  }

  // No similar memory — fresh insert
  return await insertNewMemory(supabase, proposed, embedding, proposed.confidence)
}

async function insertNewMemory(
  supabase: any,
  proposed: ProposedAIMemory,
  embedding: number[],
  confidence: number,
): Promise<AIMemory> {
  const { data, error } = await supabase
    .from("ai_memories")
    .insert({
      user_id: proposed.user_id,
      organization_id: proposed.organization_id ?? null,
      memory_type: proposed.memory_type,
      input_text: proposed.input_text,
      normalized_summary: proposed.normalized_summary,
      outcome_json: proposed.outcome_json,
      source_event_id: proposed.source_event_id ?? null,
      source_type: proposed.source_type,
      weight: proposed.weight,
      confidence,
      source_count: 1,
      embedding,
      status: "active",
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to insert memory: ${error.message}`)
  }

  return data as AIMemory
}

export async function maybeCreateAIMemoryFromEvent(
  supabase: any,
  event: AIMemoryEventInput,
): Promise<{ created: boolean; memory?: AIMemory }> {
  const { id: eventId } = await recordAIMemoryEvent(supabase, event)

  if (!shouldCreateMemoryFromEvent(event)) {
    return { created: false }
  }

  const proposed = await buildMemoryFromEvent(supabase, event)
  // Attach the event id so the memory row references its origin event
  proposed.source_event_id = eventId

  const memory = await mergeSimilarMemoryOrInsert(supabase, proposed)

  return { created: true, memory }
}

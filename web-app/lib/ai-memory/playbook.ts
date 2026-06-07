import type { AIPlaybook, MemoryType, PlaybookType } from "./types"

/** Maps playbook types to the memory types whose patterns are relevant. */
const PLAYBOOK_MEMORY_TYPE_MAP: Record<PlaybookType, MemoryType[]> = {
  task_categorization: ["task_categorization", "project_routing", "general_preference"],
  email_categorization: ["email_categorization", "rule_precedent"],
  project_routing: ["project_routing", "task_categorization"],
  priority_estimation: ["priority_judgment", "urgency_judgment", "estimate_judgment"],
  global: [
    "task_categorization",
    "email_categorization",
    "priority_judgment",
    "estimate_judgment",
    "project_routing",
    "due_date_judgment",
    "urgency_judgment",
    "rule_precedent",
    "general_preference",
  ],
}

const PLAYBOOK_MODEL = "gpt-4.1-mini"
const MAX_PLAYBOOK_TOKENS = 600
const MAX_SOURCE_MEMORIES = 50

export async function getLatestActivePlaybook(
  supabase: any,
  {
    userId,
    organizationId,
    playbookType,
  }: {
    userId: string
    organizationId?: string | null
    playbookType: PlaybookType
  },
): Promise<AIPlaybook | null> {
  let query = supabase
    .from("ai_playbooks")
    .select("*")
    .eq("user_id", userId)
    .eq("playbook_type", playbookType)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)

  if (organizationId) {
    query = query.eq("organization_id", organizationId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch playbook: ${error.message}`)
  }

  return data as AIPlaybook | null
}

export async function distillPlaybookFromMemories(
  supabase: any,
  {
    userId,
    organizationId,
    playbookType,
  }: {
    userId: string
    organizationId?: string | null
    playbookType: PlaybookType
  },
): Promise<AIPlaybook> {
  const relevantTypes = PLAYBOOK_MEMORY_TYPE_MAP[playbookType]

  let query = supabase
    .from("ai_memories")
    .select("id, memory_type, normalized_summary, outcome_json, weight, confidence, source_count")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("memory_type", relevantTypes)
    .order("weight", { ascending: false })
    .limit(MAX_SOURCE_MEMORIES)

  if (organizationId) {
    query = query.eq("organization_id", organizationId)
  }

  const { data: memories, error: memError } = await query

  if (memError) {
    throw new Error(`Failed to fetch memories for playbook: ${memError.message}`)
  }

  if (!memories || memories.length === 0) {
    throw new Error("No active memories found to distill into a playbook")
  }

  // Compute next version
  let versionQuery = supabase
    .from("ai_playbooks")
    .select("version")
    .eq("user_id", userId)
    .eq("playbook_type", playbookType)
    .order("version", { ascending: false })
    .limit(1)

  if (organizationId) {
    versionQuery = versionQuery.eq("organization_id", organizationId)
  }

  const { data: latestVersionRow } = await versionQuery.maybeSingle()
  const nextVersion = (latestVersionRow?.version ?? 0) + 1

  // Build context for OpenAI
  const memoryLines = memories
    .map(
      (m: any, i: number) =>
        `${i + 1}. [${m.memory_type}] ${m.normalized_summary} → ${JSON.stringify(m.outcome_json)} (weight: ${m.weight}, confidence: ${m.confidence})`,
    )
    .join("\n")

  const systemPrompt = `You distill AI memory precedents into a concise decision playbook in markdown.
Group patterns by theme. Use headings and bullet points.
Be prescriptive but not deterministic — these are judgment guides, not hard rules.
Maximum ${MAX_PLAYBOOK_TOKENS} tokens of output. No preamble.`

  const userContent = `Create a ${playbookType} playbook from these ${memories.length} learned patterns:\n\n${memoryLines}`

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured")
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PLAYBOOK_MODEL,
      temperature: 0.3,
      max_tokens: MAX_PLAYBOOK_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI playbook request failed (${response.status}): ${errorText}`)
  }

  const payload = await response.json()
  const contentMarkdown: string = payload?.choices?.[0]?.message?.content ?? ""
  if (!contentMarkdown) {
    throw new Error("Playbook response missing content")
  }

  const sourceMemoryIds: string[] = memories.map((m: any) => m.id)

  const { data: newPlaybook, error: insertError } = await supabase
    .from("ai_playbooks")
    .insert({
      user_id: userId,
      organization_id: organizationId ?? null,
      playbook_type: playbookType,
      version: nextVersion,
      content_markdown: contentMarkdown,
      source_memory_ids: sourceMemoryIds,
      status: "active",
      created_by: "ai",
    })
    .select()
    .single()

  if (insertError) {
    throw new Error(`Failed to insert playbook: ${insertError.message}`)
  }

  return newPlaybook as AIPlaybook
}

import { generateEmbedding } from "@/lib/ai-core/embeddings"
import { redactSensitiveMemoryText } from "@/lib/ai-core/redact"
import type { MemoryType, RetrievedAIMemory } from "./types"

export async function retrieveRelevantAIMemory(
  supabase: any,
  {
    userId,
    organizationId,
    inputText,
    memoryTypes,
    limit = 6,
  }: {
    userId: string
    organizationId?: string | null
    inputText: string
    memoryTypes: MemoryType[]
    limit?: number
  },
): Promise<RetrievedAIMemory[]> {
  const clampedLimit = Math.min(8, Math.max(1, limit))

  const safeText = redactSensitiveMemoryText(inputText)
  const embedding = await generateEmbedding(safeText)

  const { data: rows, error } = await supabase.rpc("match_ai_memories", {
    p_user_id: userId,
    p_query_embedding: embedding,
    p_memory_types: memoryTypes,
    p_organization_id: organizationId ?? null,
    p_limit: clampedLimit,
  })

  if (error) {
    throw new Error(`match_ai_memories RPC failed: ${error.message}`)
  }

  if (!rows || rows.length === 0) {
    return []
  }

  const memories: RetrievedAIMemory[] = rows.map((row: any) => ({
    id: row.id,
    memory_type: row.memory_type,
    input_text: row.input_text,
    normalized_summary: row.normalized_summary,
    outcome_json: row.outcome_json ?? {},
    source_type: row.source_type,
    weight: row.weight,
    confidence: row.confidence,
    source_count: row.source_count,
    similarity: row.similarity,
    score: row.score,
  }))

  // Fire-and-forget last_used_at update
  const ids = memories.map((m) => m.id)
  supabase
    .from("ai_memories")
    .update({ last_used_at: new Date().toISOString() })
    .in("id", ids)
    .then(() => {})
    .catch(() => {})

  return memories
}

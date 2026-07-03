/**
 * Private, trainable spam classifier — embeddings + k-NN over a growing set of
 * user-labeled (and seeded) spam/ham examples. Model + storage reuse:
 *   - embeddings: generateSpamEmbedding (Cloudflare bge, 768-d) — ai-core/embeddings.ts
 *   - vectors:    spam_signatures + match_spam_signatures RPC (pgvector)
 *   - dedup-upsert: pattern from mergeSimilarMemoryOrInsert (ai-memory/write.ts)
 *
 * Written provider-generically so a non-email text classifier can reuse it.
 */
import { getAdminClient } from "@/lib/supabase/admin"
import { generateSpamEmbedding } from "@/lib/ai-core/embeddings"
import { extractPlainTextPreview } from "@/lib/email-inbox/shared"

export type SpamLabel = "spam" | "not_spam"
export type SpamFallbackMode = "llm" | "private"

/** Confidence at/above which the k-NN verdict is used directly (no LLM backstop). */
export function getSpamConfidenceThreshold(): number {
  const raw = Number(process.env.SPAM_CONFIDENCE_THRESHOLD)
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.72
}

export function getSpamFallbackMode(): SpamFallbackMode {
  return process.env.SPAM_FALLBACK_MODE === "private" ? "private" : "llm"
}

/** Body chars fed into the embedding — enough signal without ballooning tokens. */
const SPAM_INPUT_BODY_CHARS = 2000
/** Dedup threshold: cosine ≥ this reinforces an existing signature (else insert). */
const SPAM_MERGE_SIMILARITY_THRESHOLD = 0.92
const SPAM_MERGE_WEIGHT_DELTA = 0.5
const SPAM_MAX_WEIGHT = 5

export interface SpamScope {
  userId: string
  organizationId?: string | null
  mailboxId?: string | null
}

export interface SpamNeighbor {
  id: string
  label: SpamLabel
  source: string
  weight: number
  similarity: number
  score: number
}

export interface SpamClassification {
  /** Winning label, or null when there are no neighbors to vote. */
  label: SpamLabel | null
  /** Signed vote score of the winning label (0..1-ish, scaled by weights). */
  score: number
  /** Share of total vote captured by the winning label (0..1). */
  confidence: number
  neighbors: SpamNeighbor[]
  /** Total active signatures the vote drew from (== neighbors.length). */
  exampleCount: number
}

/**
 * Build the text embedded for a thread — subject + sender + a body preview,
 * mirroring how analyzeThreadWithAI assembles its classification input (ai.ts).
 */
export function buildSpamInputText(
  thread: { subject?: string | null },
  message: {
    subject?: string | null
    body_text?: string | null
    senderEmail?: string | null
  },
): string {
  const subject = (message.subject || thread.subject || "").trim()
  const sender = (message.senderEmail || "").trim()
  const body = extractPlainTextPreview(message.body_text || "", SPAM_INPUT_BODY_CHARS)
  return [
    subject ? `Subject: ${subject}` : "",
    sender ? `From: ${sender}` : "",
    body ? `Body: ${body}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000)
}

/**
 * Classify text via k-NN over the user's spam_signatures. Weighted vote: each
 * neighbor contributes its blended score to its label; the winner's confidence
 * is its share of the total vote. Returns { label: null } with zero confidence
 * when the corpus is empty (cold start) so callers fall through to the backstop.
 */
export async function classifySpam(
  text: string,
  scope: SpamScope,
): Promise<SpamClassification> {
  const admin = getAdminClient()
  const embedding = await generateSpamEmbedding(text)

  const { data: rows, error } = await admin.rpc("match_spam_signatures", {
    p_user_id: scope.userId,
    p_query_embedding: embedding,
    p_organization_id: scope.organizationId ?? null,
    p_mailbox_id: scope.mailboxId ?? null,
    p_limit: 8,
  })

  if (error) {
    throw new Error(`match_spam_signatures RPC failed: ${error.message}`)
  }

  const neighbors: SpamNeighbor[] = (rows || []).map((r: any) => ({
    id: String(r.id),
    label: (r.label === "spam" ? "spam" : "not_spam") as SpamLabel,
    source: String(r.source),
    weight: Number(r.weight) || 1,
    similarity: Number(r.similarity) || 0,
    score: Number(r.score) || 0,
  }))

  if (neighbors.length === 0) {
    return { label: null, score: 0, confidence: 0, neighbors, exampleCount: 0 }
  }

  let spamVote = 0
  let hamVote = 0
  for (const n of neighbors) {
    const contribution = Math.max(n.score, 0)
    if (n.label === "spam") spamVote += contribution
    else hamVote += contribution
  }

  const total = spamVote + hamVote
  const label: SpamLabel = spamVote >= hamVote ? "spam" : "not_spam"
  const winning = label === "spam" ? spamVote : hamVote
  const confidence = total > 0 ? winning / total : 0

  return {
    label,
    score: winning,
    confidence,
    neighbors,
    exampleCount: neighbors.length,
  }
}

export interface RecordSpamLabelInput {
  userId: string
  organizationId?: string | null
  mailboxId?: string | null
  threadId?: string | null
  text: string
  label: SpamLabel
  note?: string | null
  source?: "user_labeled" | "ai_seed" | "imported"
}

export interface RecordSpamLabelResult {
  id: string
  merged: boolean
  weight: number
}

/**
 * Persist a training label: embed the text, dedup against existing signatures
 * (reinforce weight when a near-identical same-label example exists, else insert)
 * — the mergeSimilarMemoryOrInsert idiom — and append an email_training_examples
 * audit row (example_type='classification') for export/future fine-tune.
 */
export async function recordSpamLabel(
  input: RecordSpamLabelInput,
): Promise<RecordSpamLabelResult> {
  const admin = getAdminClient()
  const embedding = await generateSpamEmbedding(input.text)
  const source = input.source ?? "user_labeled"

  const { data: matches, error: rpcError } = await admin.rpc("match_spam_signatures", {
    p_user_id: input.userId,
    p_query_embedding: embedding,
    p_organization_id: input.organizationId ?? null,
    p_mailbox_id: input.mailboxId ?? null,
    p_limit: 3,
  })
  if (rpcError) {
    throw new Error(`match_spam_signatures RPC failed: ${rpcError.message}`)
  }

  const top = (matches || [])[0]
  let result: RecordSpamLabelResult

  if (
    top &&
    top.label === input.label &&
    Number(top.similarity) >= SPAM_MERGE_SIMILARITY_THRESHOLD
  ) {
    // Reinforce the existing signature (same label, near-identical text).
    const newWeight = Math.min((Number(top.weight) || 1) + SPAM_MERGE_WEIGHT_DELTA, SPAM_MAX_WEIGHT)
    const { data: updated, error: updateError } = await admin
      .from("spam_signatures")
      .update({
        weight: newWeight,
        embedding,
        note: input.note ?? null,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", top.id)
      .select("id, weight")
      .single()
    if (updateError) {
      throw new Error(`Failed to merge spam signature: ${updateError.message}`)
    }
    result = { id: String(updated.id), merged: true, weight: Number(updated.weight) || newWeight }
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("spam_signatures")
      .insert({
        user_id: input.userId,
        organization_id: input.organizationId ?? null,
        mailbox_id: input.mailboxId ?? null,
        thread_id: input.threadId ?? null,
        label: input.label,
        input_text: input.text.slice(0, 8000),
        note: input.note ?? null,
        weight: 1,
        source,
        embedding,
        status: "active",
      })
      .select("id, weight")
      .single()
    if (insertError) {
      throw new Error(`Failed to insert spam signature: ${insertError.message}`)
    }
    result = { id: String(inserted.id), merged: false, weight: Number(inserted.weight) || 1 }
  }

  // Audit trail (best-effort — training signal must never break the action).
  try {
    await admin.from("email_training_examples").insert({
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      mailbox_id: input.mailboxId ?? null,
      thread_id: input.threadId ?? null,
      example_type: "classification",
      input_text: input.text.slice(0, 8000),
      output_json: { label: input.label, source },
      correction_note: input.note ?? null,
    })
  } catch (e) {
    console.error("recordSpamLabel: email_training_examples insert failed:", e)
  }

  return result
}

export interface SpamStats {
  total: number
  spam: number
  not_spam: number
  bySource: Record<string, number>
  /** Recent classification accuracy: user labels that agreed with the k-NN vote. */
  recentAccuracy: number | null
  recentSampleSize: number
}

/**
 * Counts by label/source plus a recent-accuracy read from ai_decision_traces
 * (email_classification): of the last N traces whose final label was later
 * corrected by a user signature, how many the model got right up front.
 */
export async function getSpamStats(scope: SpamScope): Promise<SpamStats> {
  const admin = getAdminClient()

  let query = admin
    .from("spam_signatures")
    .select("label, source, status")
    .eq("user_id", scope.userId)
    .eq("status", "active")
  if (scope.mailboxId) query = query.eq("mailbox_id", scope.mailboxId)

  const { data: rows, error } = await query
  if (error) {
    throw new Error(`getSpamStats query failed: ${error.message}`)
  }

  const stats: SpamStats = {
    total: 0,
    spam: 0,
    not_spam: 0,
    bySource: {},
    recentAccuracy: null,
    recentSampleSize: 0,
  }
  for (const r of rows || []) {
    stats.total += 1
    if (r.label === "spam") stats.spam += 1
    else if (r.label === "not_spam") stats.not_spam += 1
    stats.bySource[r.source] = (stats.bySource[r.source] || 0) + 1
  }

  // Recent accuracy: compare stored spam classifications against subsequent
  // user labels for the same thread (predicted spam vs. corrected not_spam etc.).
  try {
    const { data: labeled } = await admin
      .from("spam_signatures")
      .select("thread_id, label, created_at")
      .eq("user_id", scope.userId)
      .eq("source", "user_labeled")
      .not("thread_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50)

    const threadIds = Array.from(
      new Set((labeled || []).map((r: any) => r.thread_id).filter(Boolean)),
    )
    if (threadIds.length > 0) {
      const { data: threads } = await admin
        .from("email_threads")
        .select("id, classification")
        .in("id", threadIds)
      const classById = new Map(
        (threads || []).map((t: any) => [String(t.id), t.classification]),
      )
      let agree = 0
      let sample = 0
      for (const r of labeled || []) {
        const predicted = classById.get(String(r.thread_id))
        if (predicted == null) continue
        sample += 1
        const predictedSpam = predicted === "spam"
        const labeledSpam = r.label === "spam"
        if (predictedSpam === labeledSpam) agree += 1
      }
      stats.recentSampleSize = sample
      stats.recentAccuracy = sample > 0 ? agree / sample : null
    }
  } catch (e) {
    console.error("getSpamStats: recent-accuracy read failed:", e)
  }

  return stats
}

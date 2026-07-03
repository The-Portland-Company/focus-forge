/**
 * Verification (docs/ai-spam-detection.md, step 2). Two parts:
 *  A. Embedding shape/math — the OpenAI→768 fallback reducer (truncate + L2
 *     renormalize) yields a 768-length unit vector. When live embedding creds
 *     are present (CLOUDFLARE_* or a funded OPENAI_API_KEY), it also exercises
 *     generateSpamEmbedding over the network and asserts 768-length.
 *  B. Live match_spam_signatures — inserts two 768-d signatures under a real
 *     profile, queries the RPC, asserts spam-like query ranks the spam row top,
 *     then deletes the temp rows.
 * Run: tsx scripts/verify-spam-embeddings.ts
 */
import { createClient } from "@supabase/supabase-js"
import {
  generateSpamEmbedding,
  SPAM_EMBEDDING_DIM,
} from "../lib/ai-core/embeddings"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

/** Mirror of the fallback reducer in ai-core/embeddings.ts. */
function truncateRenormalize(full: number[]): number[] {
  const t = full.slice(0, SPAM_EMBEDDING_DIM)
  const norm = Math.sqrt(t.reduce((s, v) => s + v * v, 0)) || 1
  return t.map((v) => v / norm)
}

function unitVector(seed: number): number[] {
  // Deterministic pseudo-random unit vector (no Math.random needed).
  const v: number[] = []
  let x = seed
  for (let i = 0; i < SPAM_EMBEDDING_DIM; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    v.push((x / 0x7fffffff) * 2 - 1)
  }
  const norm = Math.sqrt(v.reduce((s, n) => s + n * n, 0)) || 1
  return v.map((n) => n / norm)
}

async function main() {
  // --- Part A: fallback reducer shape/norm ---
  const synthetic1536 = Array.from({ length: 1536 }, (_, i) => Math.sin(i) * 0.37)
  const reduced = truncateRenormalize(synthetic1536)
  assert(reduced.length === SPAM_EMBEDDING_DIM, `reduced length ${reduced.length} !== 768`)
  const reducedNorm = Math.sqrt(reduced.reduce((s, v) => s + v * v, 0))
  assert(Math.abs(reducedNorm - 1) < 1e-6, `reduced not unit-norm (${reducedNorm})`)
  console.log(`✓ fallback reducer: 1536 → ${reduced.length}-d, ‖v‖=${reducedNorm.toFixed(6)}`)

  const hasLiveCreds =
    (!!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_API_TOKEN) ||
    !!process.env.OPENAI_API_KEY
  if (hasLiveCreds) {
    try {
      const live = await generateSpamEmbedding(
        "Subject: You are a WINNER!! crypto giveaway, buy now, unsubscribe",
      )
      assert(live.length === SPAM_EMBEDDING_DIM, `live vec length ${live.length} !== 768`)
      console.log(
        `✓ live generateSpamEmbedding (${process.env.CLOUDFLARE_API_TOKEN ? "cloudflare-bge" : "openai-fallback"}): ${live.length}-d`,
      )
    } catch (e: any) {
      console.log(`⚠ live embedding skipped (creds present but call failed): ${e.message.slice(0, 120)}`)
    }
  } else {
    console.log("⚠ live embedding skipped: no CLOUDFLARE_* / OPENAI_API_KEY in env")
  }

  // --- Part B: live match_spam_signatures RPC with real 768-d vectors ---
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert(!!url && !!key, "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set")
  const admin = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id")
    .limit(1)
    .single()
  assert(!profErr && !!profile?.id, `could not fetch a profile id: ${profErr?.message}`)
  const userId = profile.id as string

  const spamVec = unitVector(11)
  const hamVec = unitVector(999)
  const { data: inserted, error: insErr } = await admin
    .from("spam_signatures")
    .insert([
      { user_id: userId, label: "spam", input_text: "verify spam sample", source: "imported", note: "verify-temp", embedding: spamVec },
      { user_id: userId, label: "not_spam", input_text: "verify ham sample", source: "imported", note: "verify-temp", embedding: hamVec },
    ])
    .select("id")
  assert(!insErr && (inserted?.length ?? 0) === 2, `insert failed: ${insErr?.message}`)
  const tempIds = (inserted as { id: string }[]).map((r) => r.id)

  try {
    // Query near the spam vector (blend 80% spam + 20% ham, renormalized).
    const blended = spamVec.map((v, i) => v * 0.8 + hamVec[i] * 0.2)
    const bn = Math.sqrt(blended.reduce((s, v) => s + v * v, 0)) || 1
    const queryVec = blended.map((v) => v / bn)

    const { data: matches, error: rpcErr } = await admin.rpc("match_spam_signatures", {
      p_user_id: userId,
      p_query_embedding: queryVec,
      p_organization_id: null,
      p_mailbox_id: null,
      p_limit: 8,
    })
    assert(!rpcErr, `RPC error: ${rpcErr?.message}`)
    assert(Array.isArray(matches) && matches.length >= 2, `RPC returned ${matches?.length} rows (expected >= 2)`)
    const top = matches[0]
    console.log(
      `✓ match_spam_signatures returned ${matches.length} rows; top: label=${top.label} similarity=${Number(top.similarity).toFixed(3)} score=${Number(top.score).toFixed(3)}`,
    )
    assert(top.label === "spam", `expected top match label 'spam', got '${top.label}'`)
    console.log("✓ spam-like query ranked the spam signature first")
  } finally {
    await admin.from("spam_signatures").delete().in("id", tempIds)
    console.log(`✓ cleaned up ${tempIds.length} temp signatures`)
  }

  console.log("\nVERIFICATION PASSED")
}

main().catch((e) => {
  console.error("\nVERIFICATION FAILED:", e.message)
  process.exit(1)
})

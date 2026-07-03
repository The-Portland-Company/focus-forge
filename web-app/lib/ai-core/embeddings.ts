export const EMBEDDING_DIM = 1536

/** Dimension of the spam-classifier embedding space (@cf/baai/bge-base-en-v1.5). */
export const SPAM_EMBEDDING_DIM = 768

/**
 * Embed text for the private spam classifier. Primary path is Cloudflare
 * Workers AI `@cf/baai/bge-base-en-v1.5` (768-d, edge, free tier) — the same
 * REST shape as runCloudflareWorkersAI in lib/ai/structured-waterfall.ts. Falls
 * back to OpenAI `generateEmbedding` (1536-d) ONLY when the Cloudflare env is
 * unset, truncating + L2-renormalizing to 768-d.
 *
 * Truncate-then-renormalize is the sanctioned reduction for `text-embedding-3-*`
 * (Matryoshka-trained, so a prefix is itself a valid unit-normalized embedding).
 * NOTE: CF-bge and truncated-OpenAI vectors live in DIFFERENT spaces — do not
 * mix them in one spam_signatures corpus. Pick one provider per deployment
 * (production has CF set, so it uses CF for both seeding and querying).
 */
export async function generateSpamEmbedding(input: string): Promise<number[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const model = process.env.SPAM_EMBED_MODEL || "@cf/baai/bge-base-en-v1.5"

  if (accountId && apiToken) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: [input.trim()] }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Cloudflare spam embedding request failed (${response.status}): ${errorText.slice(0, 400)}`,
      )
    }

    const payload = await response.json()
    const embedding = payload?.result?.data?.[0]
    if (!Array.isArray(embedding) || embedding.length !== SPAM_EMBEDDING_DIM) {
      throw new Error(
        `Cloudflare embedding response malformed (expected ${SPAM_EMBEDDING_DIM}-d array)`,
      )
    }
    return embedding as number[]
  }

  // Fallback: OpenAI 1536-d → truncate to 768-d prefix → L2-renormalize.
  const full = await generateEmbedding(input)
  const truncated = full.slice(0, SPAM_EMBEDDING_DIM)
  if (truncated.length !== SPAM_EMBEDDING_DIM) {
    throw new Error(
      `OpenAI fallback embedding too short (${truncated.length} < ${SPAM_EMBEDDING_DIM})`,
    )
  }
  const norm = Math.sqrt(truncated.reduce((sum, v) => sum + v * v, 0)) || 1
  return truncated.map((v) => v / norm)
}

export async function generateEmbedding(input: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured")
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: input.trim(),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `OpenAI embeddings request failed (${response.status}): ${errorText}`,
    )
  }

  const payload = await response.json()
  const embedding = payload?.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error("Embeddings response missing embedding array")
  }

  return embedding as number[]
}

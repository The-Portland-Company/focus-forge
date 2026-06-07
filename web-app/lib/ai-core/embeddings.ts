export const EMBEDDING_DIM = 1536

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

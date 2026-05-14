const ESTIMATOR_MODEL = "gpt-4.1-mini";

export type EstimateConfidence = "low" | "med" | "high";

export interface TaskEstimateResult {
  minutes: number;
  confidence: EstimateConfidence;
  rationale?: string;
}

const ESTIMATE_SCHEMA = {
  name: "task_time_estimate",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      minutes: { type: "integer", minimum: 5, maximum: 480 },
      confidence: { type: "string", enum: ["low", "med", "high"] },
      rationale: { type: "string" },
    },
    required: ["minutes", "confidence", "rationale"],
  },
} as const;

const SYSTEM_PROMPT = `You estimate how long a single task will take an experienced knowledge worker.

Rules:
- Output JSON only matching the provided schema, no markdown.
- minutes must be between 5 and 480 (8 hours).
- Round to common chunks: 15, 30, 45, 60, 90, 120, 180, 240, 360, 480.
- Be realistic, not aspirational. Include time for context-switching when implied.
- confidence "high" only when the task is concrete and the scope is clear.
- rationale is one short sentence explaining the estimate.`;

function clampMinutes(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 30;
  return Math.min(480, Math.max(5, Math.round(num)));
}

function normalizeConfidence(value: unknown): EstimateConfidence {
  if (value === "high" || value === "med" || value === "low") {
    return value;
  }
  return "low";
}

export async function estimateTaskMinutes(input: {
  name: string;
  description?: string | null;
}): Promise<TaskEstimateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const cleanedName = input.name?.trim() || "";
  if (!cleanedName) {
    throw new Error("Task name is required for estimation");
  }
  const cleanedDescription = (input.description || "").toString().trim();

  const userMessage =
    `Estimate this task:\n` +
    `Title: ${cleanedName}\n` +
    (cleanedDescription
      ? `Description: ${cleanedDescription.slice(0, 2000)}\n`
      : "Description: (none)\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ESTIMATOR_MODEL,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: ESTIMATE_SCHEMA,
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI estimator request failed (${response.status}): ${errorText}`,
    );
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Estimator response missing JSON content");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Estimator returned invalid JSON");
  }

  return {
    minutes: clampMinutes(parsed.minutes),
    confidence: normalizeConfidence(parsed.confidence),
    rationale:
      typeof parsed.rationale === "string" ? parsed.rationale : undefined,
  };
}

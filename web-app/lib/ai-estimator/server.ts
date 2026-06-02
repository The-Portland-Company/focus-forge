import type { CalibrationExample } from "./examples";

const ESTIMATOR_MODEL = "gpt-4.1-mini";

export type EstimateConfidence = "low" | "med" | "high";

export interface TaskEstimateResult {
  minutes: number;
  confidence: EstimateConfidence;
  rationale?: string;
}

export interface EstimateTaskInput {
  name: string;
  description?: string | null;
  projectName?: string | null;
  tags?: string[] | null;
  priority?: number | null;
  dueInDays?: number | null;
  subtaskCount?: number | null;
  /** Up to ~12 recent calibrations from this user, used as few-shot signal. */
  examples?: CalibrationExample[];
}

const ESTIMATE_SCHEMA = {
  name: "task_time_estimate",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      minutes: { type: "integer", minimum: 1, maximum: 480 },
      confidence: { type: "string", enum: ["low", "med", "high"] },
      rationale: { type: "string" },
    },
    required: ["minutes", "confidence", "rationale"],
  },
} as const;

const SYSTEM_PROMPT = `You estimate how long a single task will take a specific knowledge worker.

Rules:
- Output JSON only matching the provided schema, no markdown.
- minutes must be between 1 and 480 (8 hours).
- Prefer common chunks: 1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480.
- Be realistic, not aspirational. Include time for context-switching when implied.
- If recent calibrations are provided, weight your estimate toward similar past durations for similar tasks.
- "high" confidence only when scope is concrete and similar calibrations agree.
- rationale is one short sentence (under ~20 words) explaining the estimate.`;

function clampMinutes(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 30;
  return Math.min(480, Math.max(1, Math.round(num)));
}

function normalizeConfidence(value: unknown): EstimateConfidence {
  if (value === "high" || value === "med" || value === "low") {
    return value;
  }
  return "low";
}

function priorityLabel(priority?: number | null): string | null {
  if (priority == null) return null;
  // Lower number = higher priority in this app (1=urgent, 4=low)
  const map: Record<number, string> = {
    1: "urgent",
    2: "high",
    3: "medium",
    4: "low",
  };
  return map[priority] ?? null;
}

function formatExamples(examples?: CalibrationExample[]): string {
  if (!examples || examples.length === 0) return "";
  const lines = examples.map((ex, i) => {
    const proj = ex.projectName ? ` [${ex.projectName}]` : "";
    const desc = ex.description
      ? ` — ${ex.description.slice(0, 80)}`
      : "";
    return `${i + 1}. "${ex.name}"${proj}${desc} → ${ex.acceptedMinutes} min`;
  });
  return `\nThis user's recent calibrations (most recent first):\n${lines.join("\n")}\n`;
}

function buildUserMessage(input: EstimateTaskInput): string {
  const cleanedName = input.name.trim();
  const cleanedDescription = (input.description || "").toString().trim();

  const contextLines: string[] = [`Title: ${cleanedName}`];
  if (input.projectName) contextLines.push(`Project: ${input.projectName}`);
  const pri = priorityLabel(input.priority);
  if (pri) contextLines.push(`Priority: ${pri}`);
  if (input.tags && input.tags.length > 0) {
    contextLines.push(`Tags: ${input.tags.slice(0, 8).join(", ")}`);
  }
  if (input.dueInDays != null) {
    if (input.dueInDays < 0) contextLines.push(`Due: overdue by ${Math.abs(input.dueInDays)}d`);
    else if (input.dueInDays === 0) contextLines.push("Due: today");
    else contextLines.push(`Due in ${input.dueInDays}d`);
  }
  if (input.subtaskCount && input.subtaskCount > 0) {
    contextLines.push(`Has ${input.subtaskCount} subtasks (estimate the parent's coordinating work only)`);
  }
  contextLines.push(
    cleanedDescription
      ? `Description: ${cleanedDescription.slice(0, 2000)}`
      : "Description: (none)",
  );

  return (
    `Estimate this task:\n${contextLines.join("\n")}\n` +
    formatExamples(input.examples)
  );
}

export async function estimateTaskMinutes(
  input: EstimateTaskInput,
): Promise<TaskEstimateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const cleanedName = input.name?.trim() || "";
  if (!cleanedName) {
    throw new Error("Task name is required for estimation");
  }

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
        { role: "user", content: buildUserMessage(input) },
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

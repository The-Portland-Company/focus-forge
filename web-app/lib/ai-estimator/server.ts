import type { CalibrationExample } from "./examples";
import {
  runStructuredWaterfall,
  type ModelSpec,
  type WaterfallFallback,
} from "@/lib/ai/structured-waterfall";
import { resolveChain, type AIModelChains } from "@/lib/ai/model-chains";

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
  /** Optional AI-memory context blocks appended to the system prompt. */
  memoryBlock?: string;
  playbookBlock?: string;
  /**
   * The user's persisted AI model chains. The estimator reads its own
   * `estimator` slice (independent of the assistant). When absent, the
   * quality-first default order is used.
   */
  modelChains?: Partial<AIModelChains> | null;
  /** Explicit override of the resolved chain (mainly for tests). */
  chain?: ModelSpec[];
}

export interface TaskEstimateResultWithModel extends TaskEstimateResult {
  /** The model that produced this estimate (for logging/persistence). */
  model: string;
  provider: string;
  /** Models tried and skipped (e.g. out of credits) before the one used. */
  fallbacks: WaterfallFallback[];
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

/**
 * Defensively extract a JSON object from a model's raw text. Anthropic uses a
 * "{"-prefill and may emit a trailing token; xAI/json_object can wrap in prose.
 * We try a direct parse, then the first {...} slice.
 */
function parseEstimateJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to brace-slice.
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // Fall through.
    }
  }
  throw new Error("Estimator returned invalid JSON");
}

export async function estimateTaskMinutesWithModel(
  input: EstimateTaskInput,
): Promise<TaskEstimateResultWithModel> {
  const cleanedName = input.name?.trim() || "";
  if (!cleanedName) {
    throw new Error("Task name is required for estimation");
  }

  // Resolve the estimator's OWN chain (independent from the assistant). When no
  // explicit chain/override is provided, fall back to the quality-first default.
  const chain =
    input.chain ?? resolveChain("estimator", input.modelChains);

  const systemPrompt = `${SYSTEM_PROMPT}${
    input.playbookBlock ? `\n\n${input.playbookBlock}` : ""
  }${input.memoryBlock ? `\n\n${input.memoryBlock}` : ""}`;

  const { text, model, provider, fallbacks } = await runStructuredWaterfall(
    chain,
    {
      systemPrompt,
      userMessage: buildUserMessage(input),
      // Strict json_schema for OpenAI; Anthropic/xAI rely on prompt + parsing.
      jsonSchema: ESTIMATE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.1,
    },
  );

  const parsed = parseEstimateJson(text);

  // Log which model produced the estimate.
  console.info(
    `[estimator] estimate produced by ${provider}/${model} (${clampMinutes(parsed.minutes)}min)`,
  );

  return {
    minutes: clampMinutes(parsed.minutes),
    confidence: normalizeConfidence(parsed.confidence),
    rationale:
      typeof parsed.rationale === "string" ? parsed.rationale : undefined,
    model,
    provider,
    fallbacks,
  };
}

export async function estimateTaskMinutes(
  input: EstimateTaskInput,
): Promise<TaskEstimateResult> {
  const { minutes, confidence, rationale } =
    await estimateTaskMinutesWithModel(input);
  return { minutes, confidence, rationale };
}

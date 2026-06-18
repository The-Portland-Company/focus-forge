/**
 * Phase 2 of the fine-tuned-estimator plan: turn curated `task_estimate_examples`
 * rows into a fine-tuning dataset.
 *
 * Critical invariant: the training PROMPT must be byte-identical to what the
 * estimator sends at inference time, or the fine-tune learns the wrong mapping.
 * So we reuse the estimator's own `SYSTEM_PROMPT` + `buildUserMessage` rather
 * than re-deriving the format here. The assistant turn is the JSON the estimator
 * is expected to emit (`{ minutes, confidence, rationale }`).
 *
 * Output is OpenAI/Gemma chat-format JSONL — one
 * `{ "messages": [system, user, assistant] }` object per line — which both
 * HuggingFace AutoTrain (for the Cloudflare LoRA path) and OpenAI fine-tuning
 * accept. No I/O here; the caller streams/persists the string.
 */

import { SYSTEM_PROMPT, buildUserMessage } from "./server";

/** A row from task_estimate_examples (snake_case as stored). */
export interface TrainingExampleRow {
  task_name: string;
  task_description?: string | null;
  project_name?: string | null;
  tags?: string[] | null;
  priority?: number | null;
  ai_confidence?: string | null;
  accepted_minutes: number;
}

export interface ChatExample {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

/** Confidence we label the assistant completion with. The human approved this
 *  duration, so it is ground truth — label it "high" unless the original AI
 *  confidence was recorded, in which case keep that. */
function completionConfidence(row: TrainingExampleRow): "low" | "med" | "high" {
  const c = row.ai_confidence;
  return c === "low" || c === "med" || c === "high" ? c : "high";
}

/** Build one chat example (system + user + assistant) for a stored row. */
export function buildChatExample(row: TrainingExampleRow): ChatExample {
  const user = buildUserMessage({
    name: row.task_name,
    description: row.task_description ?? null,
    projectName: row.project_name ?? null,
    tags: row.tags ?? null,
    priority: row.priority ?? null,
    // dueInDays/subtaskCount are not retained on the example snapshot, and the
    // human's approved duration already bakes them in — omit rather than guess.
  });

  const assistant = JSON.stringify({
    minutes: row.accepted_minutes,
    confidence: completionConfidence(row),
    rationale: "Calibrated from this user's approved estimate.",
  });

  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ],
  };
}

/** Serialize rows into chat-format JSONL (one object per line, trailing \n). */
export function buildTrainingJsonl(rows: TrainingExampleRow[]): string {
  if (rows.length === 0) return "";
  return (
    rows.map((row) => JSON.stringify(buildChatExample(row))).join("\n") + "\n"
  );
}

/**
 * The judge behind the "AI decides" inbox-tab condition.
 *
 * A tab rule can ask a plain-English yes/no question about an email ("the
 * summary is about a client invoice"). This module answers that question for
 * one email and a set of questions in a single model call, using the shared
 * provider waterfall (Anthropic → OpenAI → …) so a dead provider falls through
 * instead of failing the feature.
 *
 * Verdicts are cached by the caller on `email_threads.ai_tab_verdicts_json`;
 * nothing here calls a model twice for the same (email, question).
 */

import { resolveChain } from "@/lib/ai/model-chains";
import { runStructuredWaterfall } from "@/lib/ai/structured-waterfall";

export interface AiTabJudgeInput {
  subject: string | null;
  summaryText: string | null;
  previewText: string | null;
  senderEmail: string | null;
  /** Normalized questions (see `aiIntentKey`). */
  prompts: string[];
}

const SYSTEM_PROMPT = [
  "You sort a user's email inbox.",
  "You are given one email (subject, sender, AI summary, body preview) and a",
  "list of yes/no questions the user wrote to decide which tab it belongs in.",
  "Answer each question strictly about THIS email.",
  "Answer true only when the email clearly satisfies the question; when the",
  "available text is too thin to tell, answer false.",
  'Reply with JSON only: {"answers":[{"question":"…","answer":true|false}]}',
  "Echo each question back verbatim, in the order given.",
].join(" ");

const RESPONSE_SCHEMA = {
  name: "ai_tab_verdicts",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answers"],
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "answer"],
          properties: {
            question: { type: "string" },
            answer: { type: "boolean" },
          },
        },
      },
    },
  },
};

/** Truncate a field so one enormous email can't blow up the prompt. */
function clip(value: string | null | undefined, max: number): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildJudgeUserMessage(input: AiTabJudgeInput): string {
  return [
    `Subject: ${clip(input.subject, 300) || "(no subject)"}`,
    `From: ${clip(input.senderEmail, 200) || "(unknown sender)"}`,
    `Summary: ${clip(input.summaryText, 800) || "(none)"}`,
    `Body preview: ${clip(input.previewText, 1200) || "(none)"}`,
    "",
    "Questions:",
    ...input.prompts.map((prompt, i) => `${i + 1}. ${prompt}`),
  ].join("\n");
}

/**
 * Parse the model's reply into a verdict per question. Questions the model
 * skipped or mangled come back `false` — a missing answer must never file mail
 * under a tab.
 */
export function parseJudgeResponse(
  text: string,
  prompts: string[],
): Record<string, boolean> {
  const verdicts: Record<string, boolean> = {};
  for (const prompt of prompts) verdicts[prompt] = false;

  let parsed: unknown;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text);
  } catch {
    return verdicts;
  }

  const answers = (parsed as { answers?: unknown })?.answers;
  if (!Array.isArray(answers)) return verdicts;

  answers.forEach((entry, index) => {
    const question =
      typeof (entry as { question?: unknown })?.question === "string"
        ? ((entry as { question: string }).question.trim().toLowerCase())
        : "";
    const answer = (entry as { answer?: unknown })?.answer === true;
    // Match on the echoed question; fall back to position when the model
    // reworded it.
    const matched = prompts.find((p) => p.toLowerCase() === question);
    const key = matched ?? prompts[index];
    if (key !== undefined) verdicts[key] = answer;
  });

  return verdicts;
}

/** Ask the model every question about one email. Never throws. */
export async function judgeAiTabPrompts(
  input: AiTabJudgeInput,
): Promise<Record<string, boolean>> {
  if (input.prompts.length === 0) return {};
  try {
    const result = await runStructuredWaterfall(resolveChain("assistant", null), {
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildJudgeUserMessage(input),
      jsonSchema: RESPONSE_SCHEMA,
      temperature: 0,
    });
    return parseJudgeResponse(result.text, input.prompts);
  } catch (error) {
    console.error(
      "[ai-tab-judge] all providers failed:",
      error instanceof Error ? error.message : error,
    );
    // No verdicts cached → the inbox retries later rather than filing wrongly.
    return {};
  }
}

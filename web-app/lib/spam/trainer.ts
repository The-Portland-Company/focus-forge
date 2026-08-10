/**
 * The training conversation behind a spam assessment.
 *
 * The user disagrees with a verdict ("this is a customer inquiry, not a
 * pitch"), argues it out, and the exchange is condensed into ONE durable
 * sentence:
 *
 *   "When emails read like {assessment} they will be marked as spam."
 *
 * That sentence is the product. It is shown back to the user, stored in
 * `spam_policies`, and fed into later assessments as context — so a correction
 * made once keeps applying instead of being re-argued on every email.
 */

import { resolveChain } from "@/lib/ai/model-chains";
import { runStructuredWaterfall } from "@/lib/ai/structured-waterfall";
import type { SpamAssessment } from "@/lib/spam/assessment";

export interface SpamTrainerTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SpamPolicyDraft {
  /** The {assessment} clause: what the mail READS LIKE, sender-agnostic. */
  assessment: string;
  /** Which way the rule points. */
  label: "spam" | "not_spam";
  /** The full sentence shown to the user and stored. */
  statement: string;
}

const CHAT_SYSTEM_PROMPT = [
  "You are refining one recipient's personal spam rules with them.",
  "They are reacting to your assessment of a specific email.",
  "Take their correction seriously: they know their own mail, their clients,",
  "and which senders matter. Do not defend a verdict they have rejected.",
  "Your job is to find the GENERAL pattern behind their correction, not to",
  "restate this one email. Ask at most one short clarifying question when the",
  "pattern is genuinely ambiguous; otherwise reflect the rule back plainly.",
  "Keep replies under 80 words. No lists, no headings, no preamble.",
].join(" ");

const POLICY_SYSTEM_PROMPT = [
  "Condense a conversation about spam rules into ONE reusable rule.",
  "Write the `assessment` clause as a description of what the mail READS LIKE:",
  "its tone, intent and shape. It must generalize beyond the single email in",
  "front of you — never name that specific sender, subject or company unless",
  "the user explicitly asked for a rule about that exact sender.",
  "The clause completes the sentence 'When emails read like ___'.",
  "Set label to not_spam when the user is protecting mail from being flagged,",
  "and to spam when they want mail like this flagged.",
  "Reply with JSON only.",
].join(" ");

const POLICY_SCHEMA = {
  name: "spam_policy",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["assessment", "label"],
    properties: {
      assessment: { type: "string" },
      label: { type: "string", enum: ["spam", "not_spam"] },
    },
  },
};

/** The one sentence the whole feature exists to produce. */
export function buildPolicyStatement(
  assessment: string,
  label: "spam" | "not_spam",
): string {
  const clause = assessment.trim().replace(/^["']|["']$/g, "").replace(/\.$/, "");
  return label === "spam"
    ? `When emails read like ${clause} they will be marked as spam.`
    : `When emails read like ${clause} they will not be marked as spam.`;
}

function describeAssessment(assessment: SpamAssessment | null): string {
  if (!assessment) return "(no assessment was produced)";
  return [
    `Verdict: ${assessment.verdict === "spam" ? "spam" : "not spam"} (${Math.round(assessment.confidence * 100)}% sure)`,
    `Summary: ${assessment.summary}`,
    ...assessment.signals.map(
      (signal) =>
        `- ${signal.signal} (${signal.direction === "spam" ? "toward spam" : "against spam"}): ${signal.detail}`,
    ),
  ].join("\n");
}

export function buildChatUserMessage(params: {
  assessment: SpamAssessment | null;
  subject: string | null;
  senderEmail: string | null;
  turns: SpamTrainerTurn[];
}): string {
  return [
    "The email under discussion:",
    `Subject: ${params.subject || "(no subject)"}`,
    `From: ${params.senderEmail || "(unknown)"}`,
    "",
    "Your assessment:",
    describeAssessment(params.assessment),
    "",
    "Conversation so far:",
    ...params.turns.map(
      (turn) => `${turn.role === "user" ? "User" : "You"}: ${turn.content}`,
    ),
  ].join("\n");
}

/** One assistant reply in the training conversation. */
export async function replyToTrainer(params: {
  assessment: SpamAssessment | null;
  subject: string | null;
  senderEmail: string | null;
  turns: SpamTrainerTurn[];
}): Promise<string> {
  const result = await runStructuredWaterfall(resolveChain("assistant", null), {
    systemPrompt: CHAT_SYSTEM_PROMPT,
    userMessage: buildChatUserMessage(params),
    temperature: 0.2,
  });
  return result.text.trim();
}

/**
 * Turn the conversation into the finalized rule. Returns null when the model
 * gives nothing usable, so the caller can say so instead of saving an empty
 * policy that would silently affect future mail.
 */
export async function finalizeSpamPolicy(params: {
  assessment: SpamAssessment | null;
  subject: string | null;
  senderEmail: string | null;
  turns: SpamTrainerTurn[];
}): Promise<SpamPolicyDraft | null> {
  const result = await runStructuredWaterfall(resolveChain("assistant", null), {
    systemPrompt: POLICY_SYSTEM_PROMPT,
    userMessage: buildChatUserMessage(params),
    jsonSchema: POLICY_SCHEMA,
    temperature: 0,
  });

  let parsed: unknown;
  try {
    const start = result.text.indexOf("{");
    const end = result.text.lastIndexOf("}");
    parsed = JSON.parse(
      start >= 0 ? result.text.slice(start, end + 1) : result.text,
    );
  } catch {
    return null;
  }

  const raw = parsed as { assessment?: unknown; label?: unknown };
  if (typeof raw?.assessment !== "string" || !raw.assessment.trim()) {
    return null;
  }
  const label = raw.label === "not_spam" ? "not_spam" : "spam";
  const assessment = raw.assessment.trim();

  return {
    assessment,
    label,
    statement: buildPolicyStatement(assessment, label),
  };
}

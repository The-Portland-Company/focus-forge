/**
 * "Why would this be spam?" — the explainable half of spam detection.
 *
 * The k-NN classifier in `lib/spam/server.ts` returns a number. This module
 * returns an argument: a verdict, a confidence, and the specific signals in
 * THIS email that drove it, in language the user can push back on.
 *
 * Deliberately on demand. Producing one costs a model call, so it runs when the
 * user asks (the Analyze button) and the result is cached on the thread; it is
 * never generated during a sync.
 *
 * The user's saved spam policies are fed in as context, so the assessment
 * reflects the training conversations they have already had rather than
 * re-litigating the same point on every email.
 */

import { resolveChain } from "@/lib/ai/model-chains";
import {
  runStructuredWaterfall,
  type ModelSpec,
} from "@/lib/ai/structured-waterfall";

export interface SpamAssessmentSignal {
  /** Short label for the signal, e.g. "Unknown sender domain". */
  signal: string;
  /** What in this email shows it. */
  detail: string;
  /** Which way this signal points. */
  direction: "spam" | "not_spam";
}

export interface SpamAssessment {
  verdict: "spam" | "not_spam";
  /** 0..1 — how sure the model is of `verdict`. */
  confidence: number;
  /** One sentence a human can read at a glance. */
  summary: string;
  signals: SpamAssessmentSignal[];
  /** Which of the user's saved policies the model applied, verbatim. */
  appliedPolicies: string[];
  generatedAt: string;
  model: string | null;
}

export interface SpamAssessmentInput {
  subject: string | null;
  senderEmail: string | null;
  senderName: string | null;
  previewText: string | null;
  bodyText: string | null;
  /** What the pipeline already decided, so the model can agree or disagree. */
  currentClassification: string | null;
  /** k-NN confidence already on record, 0..1, when there is one. */
  knnConfidence: number | null;
  /** The user's finalized policy statements. */
  policies: string[];
  /** The recipient's own name(s) — first, last, full — for the greeting signal. */
  recipientNames?: string[];
  /** The recipient's business/organization name, if known. */
  businessName?: string | null;
}

const SYSTEM_PROMPT = [
  "You judge whether ONE email is spam, and you explain yourself.",
  "Spam means unsolicited bulk mail or cold outreach the recipient never asked",
  "for. It does NOT mean mail that is merely automated: service alerts,",
  "receipts, security notices, billing failures, newsletters the recipient",
  "subscribed to, and inbound customer inquiries are NOT spam.",
  "Weigh the recipient's own saved policies above your general priors; they",
  "wrote those rules after reviewing their own mail.",
  "If the greeting addresses the recipient by their business or organization",
  "name rather than a personal name, treat that as a strong cold-outreach /",
  "mass-merge spam signal — legitimate correspondents use a personal name or",
  "none. Cite it as a signal when it applies.",
  "Cite concrete evidence from THIS email — a sender domain, a phrase, a",
  "pattern. Never invent details that are not in the text you were given.",
  "Give between 2 and 5 signals. Signals may point either way; include the ones",
  "that argue against your verdict when they exist.",
  "Reply with JSON only.",
].join(" ");

const RESPONSE_SCHEMA = {
  name: "spam_assessment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "confidence", "summary", "signals", "appliedPolicies"],
    properties: {
      verdict: { type: "string", enum: ["spam", "not_spam"] },
      confidence: { type: "number" },
      summary: { type: "string" },
      signals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["signal", "detail", "direction"],
          properties: {
            signal: { type: "string" },
            detail: { type: "string" },
            direction: { type: "string", enum: ["spam", "not_spam"] },
          },
        },
      },
      appliedPolicies: { type: "array", items: { type: "string" } },
    },
  },
};

/** Trim a field so one enormous email cannot blow up the prompt. */
function clip(value: string | null | undefined, max: number): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildAssessmentUserMessage(input: SpamAssessmentInput): string {
  const lines = [
    `Subject: ${clip(input.subject, 300) || "(no subject)"}`,
    `From: ${clip(input.senderName, 120)} <${clip(input.senderEmail, 200) || "unknown"}>`,
    `Body: ${clip(input.bodyText || input.previewText, 2500) || "(no body text)"}`,
  ];

  const names = (input.recipientNames || [])
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length > 0) {
    lines.push(`Recipient's personal name(s): ${names.join(", ")}`);
  }
  if (input.businessName && input.businessName.trim()) {
    lines.push(`Recipient's business/organization name: ${input.businessName.trim()}`);
  }

  if (input.currentClassification) {
    lines.push(
      `Current classification in the app: ${input.currentClassification}`,
    );
  }
  if (typeof input.knnConfidence === "number") {
    lines.push(
      `Trained classifier confidence on record: ${Math.round(input.knnConfidence * 100)}%`,
    );
  }

  lines.push("");
  if (input.policies.length > 0) {
    lines.push("The recipient's saved spam policies:");
    input.policies.forEach((policy, index) => {
      lines.push(`${index + 1}. ${policy}`);
    });
    lines.push(
      "Echo back, in appliedPolicies, any of these you actually relied on.",
    );
  } else {
    lines.push(
      "The recipient has no saved spam policies yet; appliedPolicies must be empty.",
    );
  }

  return lines.join("\n");
}

/**
 * Parse a model reply into an assessment. Anything malformed becomes null so
 * the caller shows "analysis failed" rather than a fabricated verdict — an
 * invented reason is worse than no reason in a feature whose whole job is to be
 * trustworthy about its reasoning.
 */
export function parseAssessmentResponse(
  text: string,
  model: string | null,
  generatedAt: string,
): SpamAssessment | null {
  let parsed: unknown;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text);
  } catch {
    return null;
  }

  const raw = parsed as Partial<SpamAssessment> & {
    signals?: unknown;
    appliedPolicies?: unknown;
  };
  if (raw?.verdict !== "spam" && raw?.verdict !== "not_spam") return null;
  if (typeof raw.summary !== "string" || !raw.summary.trim()) return null;

  const confidence = Number(raw.confidence);
  const signals = Array.isArray(raw.signals)
    ? raw.signals
        .map((entry) => {
          const item = entry as Partial<SpamAssessmentSignal>;
          if (
            typeof item?.signal !== "string" ||
            typeof item?.detail !== "string"
          ) {
            return null;
          }
          return {
            signal: item.signal.trim(),
            detail: item.detail.trim(),
            direction:
              item.direction === "not_spam"
                ? ("not_spam" as const)
                : ("spam" as const),
          };
        })
        .filter((entry): entry is SpamAssessmentSignal => entry !== null)
    : [];

  return {
    verdict: raw.verdict,
    confidence: Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : 0,
    summary: raw.summary.trim(),
    signals,
    appliedPolicies: Array.isArray(raw.appliedPolicies)
      ? raw.appliedPolicies
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
    generatedAt,
    model,
  };
}

/**
 * Run the assessment. Throws only when every provider is unavailable.
 *
 * `chain` overrides the model waterfall — the pipeline passes the org's email
 * chain so auto-catch assessments use the same (DeepSeek-first) providers as
 * triage; the on-demand Analyze button omits it and gets the assistant chain.
 */
export async function assessSpam(
  input: SpamAssessmentInput,
  now: string,
  chain?: ModelSpec[],
): Promise<SpamAssessment | null> {
  const result = await runStructuredWaterfall(
    chain && chain.length > 0 ? chain : resolveChain("assistant", null),
    {
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildAssessmentUserMessage(input),
      jsonSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  );
  return parseAssessmentResponse(result.text, result.model ?? null, now);
}

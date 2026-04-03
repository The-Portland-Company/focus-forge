import {
  extractPlainTextPreview,
  normalizeSubject,
} from "@/lib/email-inbox/shared";
import type { EmailRuleCondition } from "@/lib/types";

const ALLOWED_FIELDS = new Set<EmailRuleCondition["field"]>([
  "sender_email",
  "sender_domain",
  "subject",
  "body",
  "mailbox",
  "participant",
]);

const ALLOWED_OPERATORS = new Set<EmailRuleCondition["operator"]>([
  "contains",
  "equals",
  "ends_with",
  "starts_with",
]);

export type SpamExceptionRuleDraftInput = {
  senderEmail: string;
  senderName?: string | null;
  subject: string;
  bodyText: string;
  mailboxId: string;
  mailboxEmail: string;
  mailboxName?: string | null;
  participantEmails?: string[];
  summaryText?: string | null;
  reason?: string | null;
};

export type SpamExceptionRuleDraft = {
  name: string;
  description: string;
  mailboxScope: "mailbox" | "user";
  conditions: EmailRuleCondition[];
  rationale: string;
};

function sanitizeSpamExceptionConditions(
  conditions: unknown,
  input: SpamExceptionRuleDraftInput,
): EmailRuleCondition[] {
  const senderEmail = input.senderEmail.trim().toLowerCase();
  const senderDomain = senderEmail.includes("@")
    ? senderEmail.split("@")[1]
    : "";

  const sanitized = Array.isArray(conditions)
    ? conditions
        .map((condition) => {
          if (!condition || typeof condition !== "object") return null;

          const field = "field" in condition ? condition.field : null;
          const operator = "operator" in condition ? condition.operator : null;
          const value = "value" in condition ? condition.value : null;

          if (
            !field ||
            typeof field !== "string" ||
            !ALLOWED_FIELDS.has(field as EmailRuleCondition["field"])
          ) {
            return null;
          }

          if (
            !operator ||
            typeof operator !== "string" ||
            !ALLOWED_OPERATORS.has(operator as EmailRuleCondition["operator"])
          ) {
            return null;
          }

          if (typeof value !== "string" || !value.trim()) {
            return null;
          }

          return {
            field: field as EmailRuleCondition["field"],
            operator: operator as EmailRuleCondition["operator"],
            value: value.trim(),
          } satisfies EmailRuleCondition;
        })
        .filter((condition): condition is EmailRuleCondition =>
          Boolean(condition),
        )
    : [];

  const deduped = Array.from(
    new Map(
      sanitized.map((condition) => [
        `${condition.field}:${condition.operator}:${condition.value.toLowerCase()}`,
        condition,
      ]),
    ).values(),
  ).slice(0, 3);

  if (deduped.length > 0) {
    return deduped;
  }

  if (senderEmail) {
    return [
      {
        field: "sender_email",
        operator: "equals",
        value: senderEmail,
      },
    ];
  }

  if (senderDomain) {
    return [
      {
        field: "sender_domain",
        operator: "equals",
        value: senderDomain,
      },
    ];
  }

  const normalizedSubject = normalizeSubject(input.subject);

  return [
    {
      field: "subject",
      operator: "contains",
      value:
        normalizedSubject.split(" ").filter(Boolean).slice(0, 4).join(" ") ||
        input.subject.trim() ||
        "trusted email",
    },
  ];
}

export function buildFallbackSpamExceptionRuleDraft(
  input: SpamExceptionRuleDraftInput,
): SpamExceptionRuleDraft {
  const senderEmail = input.senderEmail.trim().toLowerCase();
  const senderDomain = senderEmail.includes("@")
    ? senderEmail.split("@")[1]
    : "";
  const mailboxLabel =
    input.mailboxName?.trim() || input.mailboxEmail.trim() || "this mailbox";
  const senderLabel = senderEmail || senderDomain || "this sender";

  return {
    name: `Never spam ${senderLabel}`.slice(0, 120),
    description:
      `Keep mail from ${senderLabel} out of spam triage for ${mailboxLabel}.`.slice(
        0,
        220,
      ),
    mailboxScope: "mailbox",
    conditions: sanitizeSpamExceptionConditions([], input),
    rationale: extractPlainTextPreview(
      input.reason ||
        input.summaryText ||
        `This thread appears legitimate enough to allow future messages from ${senderLabel}.`,
      180,
    ),
  };
}

export function buildSpamExceptionRulePayload(params: {
  userId: string;
  draft: SpamExceptionRuleDraft;
  mailboxId: string;
}) {
  return {
    userId: params.userId,
    mailboxId:
      params.draft.mailboxScope === "mailbox" ? params.mailboxId : null,
    name: params.draft.name.trim() || "Never spam trusted sender",
    description: params.draft.description.trim() || null,
    source: "user" as const,
    isActive: true,
    priority: 1,
    matchMode: "all" as const,
    conditions: params.draft.conditions,
    actions: [{ type: "never_spam" as const }],
    stopProcessing: false,
  };
}

export function buildSpamExceptionRevertPayload() {
  return {
    isActive: false,
  };
}

function normalizeSpamExceptionRuleDraft(
  draft: Partial<SpamExceptionRuleDraft> | null | undefined,
  input: SpamExceptionRuleDraftInput,
  fallback: SpamExceptionRuleDraft,
): SpamExceptionRuleDraft {
  return {
    name: String(draft?.name || fallback.name)
      .trim()
      .slice(0, 120),
    description: String(draft?.description || fallback.description)
      .trim()
      .slice(0, 220),
    mailboxScope: draft?.mailboxScope === "user" ? "user" : "mailbox",
    conditions: sanitizeSpamExceptionConditions(draft?.conditions, input),
    rationale:
      extractPlainTextPreview(
        typeof draft?.rationale === "string" ? draft.rationale : "",
        180,
      ) || fallback.rationale,
  };
}

export async function generateSpamExceptionRuleDraft(
  input: SpamExceptionRuleDraftInput,
): Promise<SpamExceptionRuleDraft> {
  const fallback = buildFallbackSpamExceptionRuleDraft(input);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "spam_exception_rule",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              mailboxScope: {
                type: "string",
                enum: ["mailbox", "user"],
              },
              rationale: { type: "string" },
              conditions: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    field: {
                      type: "string",
                      enum: Array.from(ALLOWED_FIELDS),
                    },
                    operator: {
                      type: "string",
                      enum: Array.from(ALLOWED_OPERATORS),
                    },
                    value: { type: "string" },
                  },
                  required: ["field", "operator", "value"],
                },
              },
            },
            required: [
              "name",
              "description",
              "mailboxScope",
              "rationale",
              "conditions",
            ],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You create precise email allow rules that prevent legitimate mail from being marked as spam. Return concise JSON only. Prefer the narrowest stable rule that will keep future mail from the same sender out of spam. Use mailbox scope unless there is strong evidence the rule should apply user-wide. The rationale must be a short UI summary, not hidden reasoning.",
        },
        {
          role: "user",
          content: JSON.stringify({
            sender: {
              email: input.senderEmail,
              name: input.senderName || null,
            },
            mailbox: {
              id: input.mailboxId,
              email: input.mailboxEmail,
              name: input.mailboxName || null,
            },
            subject: input.subject,
            normalizedSubject: normalizeSubject(input.subject),
            summaryText: input.summaryText || null,
            reason: input.reason || null,
            bodyPreview: extractPlainTextPreview(input.bodyText, 320),
            participants: input.participantEmails || [],
            fallback,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    return fallback;
  }

  const payload = await response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    return fallback;
  }

  try {
    return normalizeSpamExceptionRuleDraft(
      JSON.parse(content),
      input,
      fallback,
    );
  } catch {
    return fallback;
  }
}

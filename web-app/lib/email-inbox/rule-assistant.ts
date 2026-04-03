import { extractPlainTextPreview } from "@/lib/email-inbox/shared";
import type { EmailRuleAction, EmailRuleCondition, Mailbox } from "@/lib/types";

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

const ALLOWED_ACTIONS = new Set<EmailRuleAction["type"]>([
  "quarantine",
  "always_delete",
  "mark_read",
  "archive",
  "spam",
  "never_spam",
  "assign_mailbox_owner",
  "require_project",
  "generate_tasks",
]);

export const EMAIL_RULE_FIELD_OPTIONS = [
  {
    field: "sender_email",
    label: "Sender email",
    description: "Match one exact sender address.",
  },
  {
    field: "sender_domain",
    label: "Sender domain",
    description: "Match a company or domain like example.com.",
  },
  {
    field: "subject",
    label: "Subject",
    description: "Match words in the email subject line.",
  },
  {
    field: "body",
    label: "Body",
    description: "Match words in the message body.",
  },
  {
    field: "mailbox",
    label: "Mailbox",
    description: "Match a mailbox name or email address.",
  },
  {
    field: "participant",
    label: "Participant",
    description: "Match any sender, recipient, or copied participant.",
  },
] satisfies Array<{
  field: EmailRuleCondition["field"];
  label: string;
  description: string;
}>;

export const EMAIL_RULE_ACTION_OPTIONS = [
  {
    action: "quarantine",
    label: "Quarantine",
    description: "Move matching mail into quarantine review.",
  },
  {
    action: "archive",
    label: "Archive",
    description: "Archive the message out of the active inbox.",
  },
  {
    action: "spam",
    label: "Mark spam",
    description: "Treat matching mail as spam.",
  },
  {
    action: "always_delete",
    label: "Always delete",
    description: "Delete matching mail automatically.",
  },
  {
    action: "mark_read",
    label: "Mark read",
    description: "Mark matching mail as read.",
  },
  {
    action: "never_spam",
    label: "Never spam",
    description: "Keep matching mail out of spam classification.",
  },
  {
    action: "require_project",
    label: "Require project",
    description: "Flag matching mail as needing a project assignment.",
  },
  {
    action: "generate_tasks",
    label: "Generate tasks",
    description: "Create tasks from matching mail when enough context exists.",
  },
  {
    action: "assign_mailbox_owner",
    label: "Assign mailbox owner",
    description: "Assign generated work to the mailbox owner.",
  },
] satisfies Array<{
  action: EmailRuleAction["type"];
  label: string;
  description: string;
}>;

export type EmailRuleAssistantDraft = {
  name: string;
  description: string;
  mailboxScope: "mailbox" | "user";
  priority: number;
  matchMode: "all" | "any";
  stopProcessing: boolean;
  conditions: EmailRuleCondition[];
  actions: EmailRuleAction[];
  rationale: string;
  assistantMessage: string;
};

export function buildEmailRuleAssistantFallback(params: {
  prompt: string;
  mailboxId?: string | null;
}): EmailRuleAssistantDraft {
  const trimmedPrompt = params.prompt.trim();

  return {
    name: extractPlainTextPreview(trimmedPrompt || "New email rule", 80),
    description: extractPlainTextPreview(
      trimmedPrompt || "Generated from the AI rule composer.",
      220,
    ),
    mailboxScope: params.mailboxId ? "mailbox" : "user",
    priority: 100,
    matchMode: "all",
    stopProcessing: true,
    conditions: [
      {
        field: "subject",
        operator: "contains",
        value:
          extractPlainTextPreview(trimmedPrompt, 48) || "important message",
      },
    ],
    actions: [{ type: "quarantine" }],
    rationale:
      "Fallback draft created because AI rule generation could not produce a structured result.",
    assistantMessage:
      "I created a starter draft from your prompt. Review the rule on the right and adjust the JSON if needed.",
  };
}

export function sanitizeEmailRuleAssistantDraft(
  draft: Partial<EmailRuleAssistantDraft> | null | undefined,
  fallback: EmailRuleAssistantDraft,
): EmailRuleAssistantDraft {
  const conditions = Array.isArray(draft?.conditions)
    ? draft.conditions
        .map((condition) => {
          if (!condition || typeof condition !== "object") return null;

          const field = "field" in condition ? condition.field : null;
          const operator = "operator" in condition ? condition.operator : null;
          const value = "value" in condition ? condition.value : null;

          if (
            typeof field !== "string" ||
            !ALLOWED_FIELDS.has(field as EmailRuleCondition["field"])
          ) {
            return null;
          }

          if (
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
        .slice(0, 5)
    : fallback.conditions;

  const actions = Array.isArray(draft?.actions)
    ? draft.actions
        .map((action) => {
          if (!action || typeof action !== "object") return null;

          const type = "type" in action ? action.type : null;
          const value = "value" in action ? action.value : undefined;

          if (
            typeof type !== "string" ||
            !ALLOWED_ACTIONS.has(type as EmailRuleAction["type"])
          ) {
            return null;
          }

          return {
            type: type as EmailRuleAction["type"],
            ...(value === undefined ? {} : { value }),
          } satisfies EmailRuleAction;
        })
        .filter((action): action is EmailRuleAction => Boolean(action))
        .slice(0, 5)
    : fallback.actions;

  return {
    name: String(draft?.name || fallback.name)
      .trim()
      .slice(0, 120),
    description: String(draft?.description || fallback.description)
      .trim()
      .slice(0, 220),
    mailboxScope:
      draft?.mailboxScope === "mailbox" || draft?.mailboxScope === "user"
        ? draft.mailboxScope
        : fallback.mailboxScope,
    priority:
      typeof draft?.priority === "number" && Number.isFinite(draft.priority)
        ? Math.min(Math.max(Math.round(draft.priority), 1), 9999)
        : fallback.priority,
    matchMode: draft?.matchMode === "any" ? "any" : fallback.matchMode,
    stopProcessing:
      typeof draft?.stopProcessing === "boolean"
        ? draft.stopProcessing
        : fallback.stopProcessing,
    conditions: conditions.length > 0 ? conditions : fallback.conditions,
    actions: actions.length > 0 ? actions : fallback.actions,
    rationale:
      extractPlainTextPreview(
        typeof draft?.rationale === "string" ? draft.rationale : "",
        200,
      ) || fallback.rationale,
    assistantMessage:
      extractPlainTextPreview(
        typeof draft?.assistantMessage === "string"
          ? draft.assistantMessage
          : "",
        240,
      ) || fallback.assistantMessage,
  };
}

export async function generateEmailRuleAssistantDraft(params: {
  prompt: string;
  mailboxes: Mailbox[];
  mailboxId?: string | null;
}): Promise<EmailRuleAssistantDraft> {
  const fallback = buildEmailRuleAssistantFallback({
    prompt: params.prompt,
    mailboxId: params.mailboxId,
  });
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_rule_draft",
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
              priority: { type: "number" },
              matchMode: {
                type: "string",
                enum: ["all", "any"],
              },
              stopProcessing: { type: "boolean" },
              rationale: { type: "string" },
              assistantMessage: { type: "string" },
              conditions: {
                type: "array",
                minItems: 1,
                maxItems: 5,
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
              actions: {
                type: "array",
                minItems: 1,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: {
                      type: "string",
                      enum: Array.from(ALLOWED_ACTIONS),
                    },
                    value: {
                      type: ["string", "number", "boolean", "null"],
                    },
                  },
                  required: ["type"],
                },
              },
            },
            required: [
              "name",
              "description",
              "mailboxScope",
              "priority",
              "matchMode",
              "stopProcessing",
              "rationale",
              "assistantMessage",
              "conditions",
              "actions",
            ],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You convert plain-English email automation requests into deterministic inbox rule drafts. Use only supported fields and actions. If the user asks for an unsupported behavior like moving messages to an arbitrary folder, do not invent a fake action. Explain the limitation in assistantMessage and generate the closest valid draft only when it is accurate. Prefer narrow and stable matching conditions. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            request: params.prompt,
            selectedMailboxId: params.mailboxId || null,
            availableMailboxes: params.mailboxes.map((mailbox) => ({
              id: mailbox.id,
              name: mailbox.name,
              email: mailbox.emailAddress,
            })),
            supportedFields: EMAIL_RULE_FIELD_OPTIONS,
            supportedActions: EMAIL_RULE_ACTION_OPTIONS,
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
    return sanitizeEmailRuleAssistantDraft(JSON.parse(content), fallback);
  } catch {
    return fallback;
  }
}

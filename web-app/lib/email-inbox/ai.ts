import type { InboxTaskSuggestion, SummaryProfile } from "@/lib/types";
import {
  extractPlainTextPreview,
  normalizeSubject,
} from "@/lib/email-inbox/shared";

export type EmailThreadAIInput = {
  subject: string;
  bodyText: string;
  senderEmail: string;
  senderName?: string | null;
  mailboxEmail: string;
  profile?: SummaryProfile | null;
  projectOptions: Array<{
    id: string;
    name: string;
    description?: string | null;
  }>;
};

export type EmailThreadAIOutput = {
  classification:
    | "actionable"
    | "newsletter"
    | "spam"
    | "waiting"
    | "reference";
  status: "active" | "quarantine" | "needs_project" | "archived" | "spam";
  actionTitle: string;
  summary: string;
  reason: string;
  confidence: number;
  needsProject: boolean;
  projectId: string | null;
  taskSuggestions: InboxTaskSuggestion[];
};

function detectSpam(subject: string, body: string, senderEmail: string) {
  const haystack = `${subject} ${body} ${senderEmail}`.toLowerCase();
  const spamSignals = [
    "unsubscribe",
    "limited time offer",
    "buy now",
    "winner",
    "viagra",
    "lottery",
    "crypto giveaway",
  ];
  return spamSignals.some((signal) => haystack.includes(signal));
}

function detectNewsletter(subject: string, senderEmail: string) {
  const normalizedSubject = subject.toLowerCase();
  return (
    senderEmail.toLowerCase().startsWith("noreply@") ||
    normalizedSubject.includes("newsletter") ||
    normalizedSubject.includes("digest") ||
    normalizedSubject.includes("update")
  );
}

function guessProjectId(
  subject: string,
  bodyText: string,
  projectOptions: EmailThreadAIInput["projectOptions"],
) {
  const haystack = `${subject} ${bodyText}`.toLowerCase();
  for (const project of projectOptions) {
    const values = [project.name, project.description || ""];
    if (
      values.some((value) => value && haystack.includes(value.toLowerCase()))
    ) {
      return project.id;
    }
  }
  return null;
}

function fallbackTaskSuggestions(
  subject: string,
  bodyText: string,
): InboxTaskSuggestion[] {
  const preview = extractPlainTextPreview(bodyText, 400);
  const sentences = preview
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const actionableSentences = sentences.filter((sentence) =>
    /\b(please|need|can you|reply|review|send|draft|schedule|follow up|confirm)\b/i.test(
      sentence,
    ),
  );

  if (actionableSentences.length > 0) {
    return actionableSentences.slice(0, 3).map((sentence) => ({
      name: sentence.slice(0, 120),
      description: preview,
      priority: 3,
    }));
  }

  return [
    {
      name: `Review and respond: ${subject || "Untitled email"}`.slice(0, 120),
      description: preview,
      priority: 3,
    },
  ];
}

export function buildHeuristicAnalysis(
  input: EmailThreadAIInput,
): EmailThreadAIOutput {
  const subject = input.subject.trim() || "Untitled email";
  const bodyText = input.bodyText.trim();

  if (detectSpam(subject, bodyText, input.senderEmail)) {
    return {
      classification: "spam",
      status: "quarantine",
      actionTitle: `Review suspicious email: ${subject}`.slice(0, 140),
      summary:
        extractPlainTextPreview(bodyText, 220) || "Potential spam detected.",
      reason: "Sender or content matched common spam signals.",
      confidence: 0.87,
      needsProject: false,
      projectId: null,
      taskSuggestions: [],
    };
  }

  if (detectNewsletter(subject, input.senderEmail)) {
    return {
      classification: "newsletter",
      status: "active",
      actionTitle: `Decide whether to archive: ${subject}`.slice(0, 140),
      summary: extractPlainTextPreview(bodyText, 220),
      reason: "The message looks like a newsletter or automated update.",
      confidence: 0.62,
      needsProject: false,
      projectId: null,
      taskSuggestions: [],
    };
  }

  const projectId = guessProjectId(subject, bodyText, input.projectOptions);
  const taskSuggestions = fallbackTaskSuggestions(subject, bodyText);
  const responseRequired = /\?|reply|respond|please|need|can you/i.test(
    `${subject} ${bodyText}`,
  );

  return {
    classification: responseRequired ? "actionable" : "reference",
    status: projectId ? "active" : "needs_project",
    actionTitle: responseRequired
      ? `Reply and handle: ${subject}`.slice(0, 140)
      : `Review context: ${subject}`.slice(0, 140),
    summary: extractPlainTextPreview(bodyText, 260),
    reason: projectId
      ? "The message looks actionable and matched an existing project."
      : "The message looks actionable but project routing was not confident.",
    confidence: projectId ? 0.74 : 0.58,
    needsProject: !projectId,
    projectId,
    taskSuggestions,
  };
}

function getResponseSchema() {
  return {
    name: "fluid_inbox_ai_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        classification: {
          type: "string",
          enum: ["actionable", "newsletter", "spam", "waiting", "reference"],
        },
        status: {
          type: "string",
          enum: ["active", "quarantine", "needs_project", "archived", "spam"],
        },
        actionTitle: { type: "string" },
        summary: { type: "string" },
        reason: { type: "string" },
        confidence: { type: "number" },
        needsProject: { type: "boolean" },
        projectId: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
        taskSuggestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              priority: {
                anyOf: [
                  { type: "integer", enum: [1, 2, 3, 4] },
                  { type: "null" },
                ],
              },
              dueDate: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
            },
            required: ["name", "description", "priority", "dueDate"],
          },
        },
      },
      required: [
        "classification",
        "status",
        "actionTitle",
        "summary",
        "reason",
        "confidence",
        "needsProject",
        "projectId",
        "taskSuggestions",
      ],
    },
  };
}

export async function analyzeThreadWithAI(
  input: EmailThreadAIInput,
): Promise<EmailThreadAIOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildHeuristicAnalysis(input);
  }

  const fallback = buildHeuristicAnalysis(input);
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
        json_schema: getResponseSchema(),
      },
      messages: [
        {
          role: "system",
          content: `You triage email into actionable work for Focus: Forge.
Return concise, task-oriented JSON only.
Prefer an existing project ID only when evidence is strong.
Use the user's summary instructions when present.
If the email is spam or low-value, quarantine it.
If actionable but you cannot confidently route it, set needsProject=true and status=needs_project.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            mailboxEmail: input.mailboxEmail,
            sender: {
              email: input.senderEmail,
              name: input.senderName || null,
            },
            subject: input.subject,
            normalizedSubject: normalizeSubject(input.subject),
            bodyText: input.bodyText,
            profile: input.profile
              ? {
                  name: input.profile.name,
                  summaryStyle: input.profile.summaryStyle,
                  instructionText: input.profile.instructionText,
                  settings: input.profile.settings,
                }
              : null,
            projects: input.projectOptions,
            fallback,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    return fallback;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(content);
    return {
      classification: parsed.classification,
      status: parsed.status,
      actionTitle: parsed.actionTitle,
      summary: parsed.summary,
      reason: parsed.reason,
      confidence: Number(parsed.confidence ?? fallback.confidence),
      needsProject: Boolean(parsed.needsProject),
      projectId:
        parsed.projectId &&
        input.projectOptions.some((project) => project.id === parsed.projectId)
          ? parsed.projectId
          : null,
      taskSuggestions: Array.isArray(parsed.taskSuggestions)
        ? parsed.taskSuggestions.map((task: any) => ({
            name: String(task.name || "").slice(0, 140),
            description: String(task.description || ""),
            priority: [1, 2, 3, 4].includes(task.priority) ? task.priority : 3,
            dueDate: task.dueDate || null,
          }))
        : fallback.taskSuggestions,
    };
  } catch {
    return fallback;
  }
}

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
  preventSpamClassification?: boolean;
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

export function formatAiGeneratedTaskName(name: string) {
  let formatted = name.trim();

  if (!formatted) {
    return "🤖 Task.";
  }

  formatted = formatted.replace(/^🤖\s*/u, "");
  formatted = formatted.replace(/👀\s*Review/g, "Review");
  formatted = formatted.replace(/💬\s*Respond/gi, "Respond");
  formatted = formatted.replace(/\bReview\b/g, "👀 Review");
  formatted = formatted.replace(/\brespond\b/gi, "💬 Respond");

  if (!/[.!?]$/.test(formatted)) {
    formatted = `${formatted}.`;
  }

  if (!formatted.startsWith("🤖 ")) {
    formatted = `🤖 ${formatted}`;
  }

  return formatted;
}

function flattenAiSummaryText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_>#~=-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureSingleSentence(value: string, maxLength = 160) {
  const normalized = flattenAiSummaryText(value);

  if (!normalized) {
    return "";
  }

  const firstSentence =
    normalized.match(/(.+?[.!?])(?:\s|$)/)?.[1]?.trim() || normalized;
  const clipped =
    firstSentence.length <= maxLength
      ? firstSentence
      : `${firstSentence.slice(0, maxLength - 1).trimEnd()}.`;

  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`;
}

function buildFallbackInboxSummary(input: {
  subject: string;
  bodyText: string;
  classification: EmailThreadAIOutput["classification"];
  status: EmailThreadAIOutput["status"];
  actionTitle: string;
}) {
  const subject = normalizeSubject(input.subject).trim() || "this email";
  const haystack = `${input.subject} ${input.bodyText}`.toLowerCase();

  if (/domain.{0,20}(expir|renew)|renewal notice/.test(haystack)) {
    return "A domain renewal deadline is approaching and needs attention.";
  }

  if (/invoice|payment|receipt|charged|billing/.test(haystack)) {
    return "This email is about a billing or payment update.";
  }

  if (/security|login|password|verify|verification|access/.test(haystack)) {
    return "This email concerns an account security or access update.";
  }

  if (input.classification === "spam" || input.status === "quarantine") {
    return `This appears to be likely spam related to ${subject}.`;
  }

  if (input.classification === "newsletter") {
    return `This is an automated update about ${subject}.`;
  }

  if (/reply and handle|respond|reply/i.test(input.actionTitle)) {
    return `The sender needs a response about ${subject}.`;
  }

  return `This email provides context about ${subject}.`;
}

export function finalizeInboxSummary(input: {
  summary: string | null | undefined;
  subject: string;
  bodyText: string;
  classification: EmailThreadAIOutput["classification"];
  status: EmailThreadAIOutput["status"];
  actionTitle: string;
}) {
  const normalizedSummary = ensureSingleSentence(input.summary || "");
  const preview = extractPlainTextPreview(input.bodyText, 220);
  const normalizedPreview = flattenAiSummaryText(preview).toLowerCase();
  const comparableSummary = flattenAiSummaryText(normalizedSummary).toLowerCase();

  if (
    comparableSummary &&
    normalizedPreview &&
    comparableSummary !== normalizedPreview &&
    !normalizedPreview.includes(comparableSummary) &&
    !comparableSummary.includes(normalizedPreview)
  ) {
    return normalizedSummary;
  }

  return ensureSingleSentence(
    buildFallbackInboxSummary({
      subject: input.subject,
      bodyText: input.bodyText,
      classification: input.classification,
      status: input.status,
      actionTitle: input.actionTitle,
    }),
  );
}

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

function detectUnsolicitedServicePitchSpam(
  subject: string,
  body: string,
  senderEmail: string,
) {
  const haystack = `${subject} ${body} ${senderEmail}`.toLowerCase();

  const solicitationSignals = [
    "if interested",
    "kindly let me know",
    "may i send you",
    "can i send you",
    "portfolio",
    "company details",
    "sample, portfolio",
  ];
  const servicePitchSignals = [
    "digital marketing company",
    "website design",
    "website designing",
    "design or develop a website",
    "design or develop",
    "it firm",
  ];

  const solicitationMatches = solicitationSignals.filter((signal) =>
    haystack.includes(signal),
  ).length;
  const servicePitchMatches = servicePitchSignals.filter((signal) =>
    haystack.includes(signal),
  ).length;

  return solicitationMatches >= 2 && servicePitchMatches >= 1;
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
      name: formatAiGeneratedTaskName(
        `Review and respond: ${subject || "Untitled email"}`.slice(0, 120),
      ),
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

  if (
    !input.preventSpamClassification &&
    (detectSpam(subject, bodyText, input.senderEmail) ||
      detectUnsolicitedServicePitchSpam(subject, bodyText, input.senderEmail))
  ) {
    const actionTitle = `Review suspicious email: ${subject}`.slice(0, 140);
    return {
      classification: "spam",
      status: "quarantine",
      actionTitle,
      summary: finalizeInboxSummary({
        summary: "Potential spam detected.",
        subject,
        bodyText,
        classification: "spam",
        status: "quarantine",
        actionTitle,
      }),
      reason: "Sender or content matched common spam signals.",
      confidence: 0.87,
      needsProject: false,
      projectId: null,
      taskSuggestions: [],
    };
  }

  if (detectNewsletter(subject, input.senderEmail)) {
    const actionTitle = `Decide whether to archive: ${subject}`.slice(0, 140);
    return {
      classification: "newsletter",
      status: "active",
      actionTitle,
      summary: finalizeInboxSummary({
        summary: "",
        subject,
        bodyText,
        classification: "newsletter",
        status: "active",
        actionTitle,
      }),
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
  const actionTitle = responseRequired
    ? `Reply and handle: ${subject}`.slice(0, 140)
    : `Review context: ${subject}`.slice(0, 140);

  return {
    classification: responseRequired ? "actionable" : "reference",
    status: projectId ? "active" : "needs_project",
    actionTitle,
    summary: finalizeInboxSummary({
      summary: "",
      subject,
      bodyText,
      classification: responseRequired ? "actionable" : "reference",
      status: projectId ? "active" : "needs_project",
      actionTitle,
    }),
    reason: projectId
      ? "The message looks actionable and matched an existing project."
      : "The message looks actionable but project routing was not confident.",
    confidence: projectId ? 0.74 : 0.58,
    needsProject: !projectId,
    projectId,
    taskSuggestions,
  };
}

export function normalizePreventedSpamResult(
  result: EmailThreadAIOutput,
  fallback: EmailThreadAIOutput,
  preventSpamClassification?: boolean,
) {
  if (!preventSpamClassification) {
    return result;
  }

  if (
    result.classification === "spam" ||
    result.status === "spam" ||
    result.status === "quarantine"
  ) {
    return fallback;
  }

  return result;
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
  if (
    !input.preventSpamClassification &&
    detectUnsolicitedServicePitchSpam(
      input.subject,
      input.bodyText,
      input.senderEmail,
    )
  ) {
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
        json_schema: getResponseSchema(),
      },
      messages: [
        {
          role: "system",
          content: `You triage email into actionable work for Focus: Forge.
Return concise, task-oriented JSON only.
The summary must be a single sentence on one line, under 160 characters, and must paraphrase the email instead of copying the body text verbatim.
Prefer an existing project ID only when evidence is strong.
Use the user's summary instructions when present.
If the email is spam or low-value, quarantine it.
Treat unsolicited vendor pitches and generic service offers as spam when they are cold outreach with no established context.
If actionable but you cannot confidently route it, set needsProject=true and status=needs_project.
${
  input.preventSpamClassification
    ? "A user rule already decided this sender must not be treated as spam. Do not return spam or quarantine."
    : ""
}`,
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
    return normalizePreventedSpamResult(
      {
        classification: parsed.classification,
        status: parsed.status,
        actionTitle: parsed.actionTitle,
        summary: finalizeInboxSummary({
          summary: parsed.summary,
          subject: input.subject,
          bodyText: input.bodyText,
          classification: parsed.classification,
          status: parsed.status,
          actionTitle: parsed.actionTitle,
        }),
        reason: parsed.reason,
        confidence: Number(parsed.confidence ?? fallback.confidence),
        needsProject: Boolean(parsed.needsProject),
        projectId:
          parsed.projectId &&
          input.projectOptions.some(
            (project) => project.id === parsed.projectId,
          )
            ? parsed.projectId
            : null,
        taskSuggestions: Array.isArray(parsed.taskSuggestions)
          ? parsed.taskSuggestions.map((task: any) => ({
              name: String(task.name || "").slice(0, 140),
              description: String(task.description || ""),
              priority: [1, 2, 3, 4].includes(task.priority)
                ? task.priority
                : 3,
              dueDate: task.dueDate || null,
            }))
          : fallback.taskSuggestions,
      },
      fallback,
      input.preventSpamClassification,
    );
  } catch {
    return fallback;
  }
}

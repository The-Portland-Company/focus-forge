// Pure helpers for the AI-origin task indicator + refinement modal.
//
// These are intentionally framework-free so they can be unit tested and reused
// by both the Today view and the refinement modal.

export interface AiCreatedTaskLink {
  threadId: string;
  generatedBy: string; // "ai" | "user" | "rule"
  rationale: string | null;
}

export interface AiRationaleSignals {
  threadId: string;
  subject: string | null;
  senderName: string | null;
  senderEmail: string | null;
  classification: string | null;
  confidence: number | null;
  reason: string | null;
}

/**
 * True only when a task was genuinely created by the AI from a task-worthy
 * email. Non-AI tasks (user/rule generated, or no link at all) return false so
 * the indicator never appears on them.
 */
export function isAiCreatedTask(
  taskId: string,
  aiCreatedByTaskId?: Record<string, AiCreatedTaskLink> | null,
): boolean {
  const link = aiCreatedByTaskId?.[taskId];
  return Boolean(link && link.generatedBy === "ai" && link.threadId);
}

/**
 * Format a confidence (0..1) as a percent label. Returns null when there is no
 * meaningful confidence so the UI can omit the chip rather than show "0%".
 */
export function formatConfidence(confidence: number | null | undefined): string | null {
  if (confidence == null || Number.isNaN(confidence)) return null;
  if (confidence <= 0) return null;
  const pct = Math.round(Math.min(confidence, 1) * 100);
  return `${pct}%`;
}

/**
 * Human label for the stored classification value.
 */
export function classificationLabel(classification: string | null | undefined): string | null {
  if (!classification) return null;
  const map: Record<string, string> = {
    actionable: "Actionable",
    newsletter: "Newsletter",
    spam: "Spam",
    waiting: "Waiting on reply",
    reference: "Reference",
    unknown: "Unclassified",
  };
  return map[classification] ?? classification;
}

/**
 * Whether we have a genuine, AI-written rationale sentence to show. When false,
 * the UI must be honest and fall back to the raw classification/confidence
 * signals instead of fabricating prose.
 */
export function hasGenuineRationale(
  signals: Pick<AiRationaleSignals, "reason"> | null | undefined,
): boolean {
  return Boolean(signals?.reason && signals.reason.trim().length > 0);
}

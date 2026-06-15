// Per-user defaults for the Email Inbox desktop reading pane (Conversation
// View). The percentage default is the initial width used before the user
// drags the divider to set an explicit pixel override. Both values persist on
// the user's `profiles` row so they survive logout and navigation.

export const MIN_EMAIL_PANEL_WIDTH_PERCENT = 30;
export const MAX_EMAIL_PANEL_WIDTH_PERCENT = 75;
// ~60% gives a Gmail-like reading-pane-dominant default and matches the
// historical EMAIL_DETAIL_PANEL_DEFAULT_FRACTION (0.6).
export const DEFAULT_EMAIL_PANEL_WIDTH_PERCENT = 60;

export const EMAIL_PANEL_WIDTH_PERCENT_OPTIONS = [40, 50, 60, 70] as const;

export function clampEmailPanelWidthPercent(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(parsed)) {
    return DEFAULT_EMAIL_PANEL_WIDTH_PERCENT;
  }

  return Math.min(
    MAX_EMAIL_PANEL_WIDTH_PERCENT,
    Math.max(MIN_EMAIL_PANEL_WIDTH_PERCENT, Math.round(parsed)),
  );
}

// Convert a stored default percentage to a pixel width for the given container.
export function emailPanelWidthPercentToPixels(
  percent: number,
  containerWidth: number,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return 0;
  }

  return Math.round((clampEmailPanelWidthPercent(percent) / 100) * containerWidth);
}

// Per-user ordering of the thread Conversation list. Persisted on the
// `profiles.email_conversation_order` column so it survives logout/navigation.
export type EmailConversationOrder = "oldest_first" | "newest_first";

export const DEFAULT_EMAIL_CONVERSATION_ORDER: EmailConversationOrder =
  "oldest_first";

export function normalizeEmailConversationOrder(
  value: unknown,
): EmailConversationOrder {
  return value === "newest_first" ? "newest_first" : "oldest_first";
}

// Normalize a persisted manual pixel override. `null`/invalid means the user
// has never dragged the divider, so the percentage default should be used.
export function normalizeEmailPanelWidthOverride(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

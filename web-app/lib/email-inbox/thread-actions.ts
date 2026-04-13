export type ThreadAction =
  | "reprocess"
  | "approve"
  | "quarantine"
  | "mark_read"
  | "archive"
  | "spam"
  | "delete"
  | "always_delete_sender";

const CONFIRMATION_REQUIRED_ACTIONS = new Set<ThreadAction>([
  "quarantine",
  "archive",
  "spam",
  "always_delete_sender",
]);

const ACTION_LABELS: Record<ThreadAction, string> = {
  reprocess: "Reprocess",
  approve: "Approve",
  quarantine: "Quarantine",
  mark_read: "Mark read",
  archive: "Archive",
  spam: "Spam",
  delete: "Delete",
  always_delete_sender: "Always Delete Sender",
};

export const DEFAULT_EMAIL_DELETE_UNDO_SECONDS = 60;
export const MIN_EMAIL_DELETE_UNDO_SECONDS = 5;
export const MAX_EMAIL_DELETE_UNDO_SECONDS = 3600;
export const DEFAULT_THREAD_ACTION_QUEUE_SECONDS = 5;

export function getThreadActionLabel(action: ThreadAction) {
  return ACTION_LABELS[action];
}

export function requiresThreadActionConfirmation(action: ThreadAction) {
  return CONFIRMATION_REQUIRED_ACTIONS.has(action);
}

export function clampEmailDeleteUndoSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_EMAIL_DELETE_UNDO_SECONDS;
  }

  return Math.min(
    MAX_EMAIL_DELETE_UNDO_SECONDS,
    Math.max(MIN_EMAIL_DELETE_UNDO_SECONDS, Math.round(value)),
  );
}

export function formatEmailDeleteUndoDuration(seconds: number) {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function getQueuedThreadActionMessage(
  action: ThreadAction,
  undoSeconds = DEFAULT_THREAD_ACTION_QUEUE_SECONDS,
) {
  return `${getThreadActionLabel(action)} queued. Undo within ${formatEmailDeleteUndoDuration(undoSeconds)}.`;
}

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

export function getThreadActionLabel(action: ThreadAction) {
  return ACTION_LABELS[action];
}

export function requiresThreadActionConfirmation(action: ThreadAction) {
  return CONFIRMATION_REQUIRED_ACTIONS.has(action);
}

export function getQueuedThreadActionMessage(action: ThreadAction) {
  return `${getThreadActionLabel(action)} queued. Undo before it runs.`;
}

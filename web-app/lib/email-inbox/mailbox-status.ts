import type { Mailbox } from "@/lib/types";
import { MAILBOX_PROVIDER_PRESETS } from "@/lib/email-inbox/provider-presets";

/**
 * Human-readable provider label for a mailbox, e.g. "Gmail" or
 * "Custom IMAP / SMTP". Falls back to the raw provider string for any
 * unexpected/unknown value so the UI never renders an empty label.
 */
export function mailboxProviderLabel(provider: Mailbox["provider"]): string {
  return MAILBOX_PROVIDER_PRESETS[provider]?.label ?? String(provider);
}

export type MailboxStatusTone = "ok" | "error" | "idle";

export type MailboxStatus = {
  tone: MailboxStatusTone;
  label: string;
  /** Sync error message when tone is "error", otherwise null. */
  detail: string | null;
};

/**
 * Maps a mailbox's sync state to a small status descriptor for the connected
 * mailboxes list:
 *   - error  → there is a lastSyncError
 *   - ok     → has synced at least once and no error
 *   - idle   → never synced and no error (freshly connected / disconnected)
 */
export function mailboxStatus(
  mailbox: Pick<Mailbox, "lastSyncedAt" | "lastSyncError">,
): MailboxStatus {
  if (mailbox.lastSyncError) {
    return {
      tone: "error",
      label: "Error",
      detail: mailbox.lastSyncError,
    };
  }
  if (mailbox.lastSyncedAt) {
    return { tone: "ok", label: "Connected", detail: null };
  }
  return { tone: "idle", label: "Not synced", detail: null };
}

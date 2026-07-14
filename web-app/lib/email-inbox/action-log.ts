import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Debug audit trail for email inbox actions — see
 * supabase/migrations/20260714120000_email_action_log.sql.
 *
 * Records the end-to-end lifecycle of a thread action so we can diagnose the
 * "deleted email reappears" race from real production timelines. Every write is
 * best-effort and MUST NEVER break the action it is observing: all failures are
 * swallowed. Writes go through the service-role admin client (RLS-exempt).
 */

export type EmailActionLogPhase =
  | "requested"
  | "optimistic"
  | "server_start"
  | "server_done"
  | "error"
  | "realtime_event";

export type EmailActionLogEntry = {
  userId?: string | null;
  threadId?: string | null;
  mailboxId?: string | null;
  action: string;
  phase: EmailActionLogPhase;
  detail?: Record<string, unknown> | null;
};

// App-side fallback purge (used only if pg_cron isn't scheduling the daily
// job). Throttled to at most once per process per hour so it never adds cost to
// the hot path. pg_cron remains the primary purge mechanism.
let lastPurgeAt = 0;
const PURGE_THROTTLE_MS = 60 * 60 * 1000;

async function maybePurge(admin: ReturnType<typeof getAdminClient>) {
  const now = Date.now();
  if (now - lastPurgeAt < PURGE_THROTTLE_MS) return;
  lastPurgeAt = now;
  try {
    // Prefer the SECURITY DEFINER helper; fall back to a direct delete.
    const { error } = await admin.rpc("purge_email_action_log");
    if (error) {
      await admin
        .from("email_action_log")
        .delete()
        .lt(
          "created_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        );
    }
  } catch {
    // Ignore — purge is opportunistic.
  }
}

/**
 * Insert one lifecycle row. Never throws. Returns nothing meaningful.
 */
export async function logEmailAction(entry: EmailActionLogEntry): Promise<void> {
  try {
    const admin = getAdminClient();
    await admin.from("email_action_log").insert({
      user_id: entry.userId ?? null,
      thread_id: entry.threadId ?? null,
      mailbox_id: entry.mailboxId ?? null,
      action: entry.action,
      phase: entry.phase,
      detail: entry.detail ?? null,
    });
    void maybePurge(admin);
  } catch {
    // Best-effort audit trail — swallow everything.
  }
}

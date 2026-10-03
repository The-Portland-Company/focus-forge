/**
 * True when a Supabase/Postgres error is the `project_lock_guard` trigger
 * refusing a delete/rename/re-parent on a locked project (see migration
 * 20261003000000_project_locks.sql). Callers map this to HTTP 423 Locked.
 */
export function isProjectLockedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes("project_locked");
}

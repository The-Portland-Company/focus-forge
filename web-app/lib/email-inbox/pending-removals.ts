import type { ThreadAction } from "./thread-actions";

/**
 * Suppresses just-actioned inbox threads from being resurrected by a stale
 * refetch/realtime reconcile that lands before the server has committed the
 * action.
 *
 * Why this exists — the "delete flicker" bug:
 * `applyThreadAction` (server.ts) performs a SLOW provider-side move
 * (IMAP/Graph) *before* writing the new thread status to the DB. Meanwhile
 * `/api/email/inbox` returns threads of every status (the client segments
 * Inbox / Trash / Archived / Spam from one list). So between the optimistic UI
 * update and the server commit, any poll/realtime/refetch returns the thread
 * with its OLD (active) status. Without suppression the row reappears in the
 * inbox, then vanishes again once the commit lands — the reported
 * "delete → reappears → disappears" flicker (and the same race exists for
 * archive/spam).
 *
 * The previous fix used a FIXED 12s tombstone: if the provider move outran the
 * timer, the guard lapsed and the flicker returned. This module replaces the
 * guess-a-duration approach with a status-aware, confirm-on-commit pin:
 *   - While a refetched row still shows a pre-commit status, keep it dropped
 *     from the list (it stays out of the active inbox — no flicker).
 *   - Once the refetched row reaches the action's terminal status (or leaves
 *     the list entirely), the server has committed → clear the pin and let the
 *     row segment normally (e.g. a deleted thread then shows in Trash).
 *   - A generous ceiling (matching the delete-undo window) guarantees a pin can
 *     never suppress a row forever if the commit never arrives.
 */
export type PendingRemoval = {
  action: ThreadAction;
  /** Absolute epoch-ms ceiling after which the pin is force-dropped, so a
   *  never-committing action can't hide a row indefinitely. */
  expiresAt: number;
};

export type PendingRemovals = Map<string, PendingRemoval>;

/** Minimal shape this module reads off an inbox item. */
export type ThreadStatusRow = { id: string; status?: string | null };

/**
 * Ceiling for how long a pin may suppress a row without server confirmation.
 * Matches DEFAULT_EMAIL_DELETE_UNDO_SECONDS (60s): long enough to outlast any
 * realistic provider move, short enough that a genuinely failed action self-heals.
 */
export const PENDING_REMOVAL_MAX_MS = 60_000;

/** Terminal DB status each pinned action drives the thread toward. A refetched
 *  row already at this status means the server has committed the action. Actions
 *  that don't do a lagging provider-side move (quarantine/approve/mark_read/…)
 *  are intentionally absent — they aren't pinned. */
const TERMINAL_STATUS: Partial<Record<ThreadAction, string>> = {
  delete: "deleted",
  always_delete_sender: "deleted",
  archive: "archived",
  spam: "spam",
};

/** Actions whose commit lags the optimistic UI and therefore need a pin. */
export function isPinnableAction(action: ThreadAction): boolean {
  return action in TERMINAL_STATUS;
}

export function getTerminalStatusForAction(action: ThreadAction): string | null {
  return TERMINAL_STATUS[action] ?? null;
}

/** Record an optimistic removal/transition so refetches can't resurrect it
 *  until the server confirms. No-op for non-pinnable actions. Mutates `map`. */
export function markPendingRemoval(
  map: PendingRemovals,
  id: string,
  action: ThreadAction,
  now: number,
  ttlMs: number = PENDING_REMOVAL_MAX_MS,
): void {
  if (!isPinnableAction(action)) return;
  map.set(id, { action, expiresAt: now + ttlMs });
}

/** Drop a pin explicitly (e.g. the action failed and the row was restored). */
export function clearPendingRemoval(map: PendingRemovals, id: string): void {
  map.delete(id);
}

/** Whether `id` is currently pinned (and not past its ceiling). Prunes an
 *  expired entry as a side effect so the map self-cleans. */
export function isPendingRemoval(
  map: PendingRemovals,
  id: string,
  now: number,
): boolean {
  const entry = map.get(id);
  if (entry === undefined) return false;
  if (now > entry.expiresAt) {
    map.delete(id);
    return false;
  }
  return true;
}

/**
 * Reconcile pins against a fresh server list, then return the list with any
 * still-pending (pre-commit) rows dropped. Mutates `map`: clears a pin when the
 * action has committed (row reached its terminal status), when the row is gone
 * from the list entirely, or when the ceiling has passed.
 *
 * The single call site is the inbox-snapshot reconcile.
 */
export function applyPendingRemovals<T extends ThreadStatusRow>(
  map: PendingRemovals,
  freshItems: T[],
  now: number,
): T[] {
  if (map.size === 0) return freshItems;

  const byId = new Map<string, T>();
  for (const item of freshItems) byId.set(item.id, item);

  for (const [id, entry] of map) {
    if (now > entry.expiresAt) {
      // Ceiling reached: stop suppressing regardless of server state.
      map.delete(id);
      continue;
    }
    const fresh = byId.get(id);
    if (fresh === undefined) {
      // Gone from the list entirely → server confirmed removal.
      map.delete(id);
      continue;
    }
    const terminal = getTerminalStatusForAction(entry.action);
    if (terminal !== null && fresh.status === terminal) {
      // Row has reached its committed status → let it segment normally.
      map.delete(id);
    }
    // Otherwise the pin stays and the row is filtered out below.
  }

  if (map.size === 0) return freshItems;
  return freshItems.filter((item) => !map.has(item.id));
}

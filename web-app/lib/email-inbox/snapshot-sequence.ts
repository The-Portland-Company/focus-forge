/**
 * Orders concurrent `/api/email/inbox` reads so a stale response can never
 * overwrite a newer one.
 *
 * Why this exists — the "rapidly deleted emails come back" bug:
 * every delete kicks off its own inbox refresh. Delete four emails inside a few
 * seconds and four reads are in flight at once, and they resolve in whatever
 * order the network hands them back. A read issued BEFORE the fourth delete
 * still describes that thread as active. The pending-removal pin
 * (see ./pending-removals) drops its suppression as soon as *some* response
 * confirms the terminal "deleted" status — so if the newer, confirming response
 * lands first and an older one lands after, the older one repopulates the list
 * wholesale and the just-deleted rows reappear.
 *
 * The fix is ordinary last-write-wins by ISSUE order rather than arrival order:
 * stamp each request as it goes out, and refuse to apply any snapshot older
 * than the newest one already applied.
 */
export type SnapshotSequence = {
  /** Stamp a request as it is issued. Call once per fetch, before awaiting. */
  next: () => number;
  /**
   * Whether a resolved response may be applied. Returns false for a response
   * that was issued before one already applied. Records the sequence when true.
   */
  shouldApply: (seq: number) => boolean;
};

export function createSnapshotSequence(): SnapshotSequence {
  let issued = 0;
  let applied = 0;

  return {
    next: () => ++issued,
    shouldApply: (seq: number) => {
      if (seq < applied) return false;
      applied = seq;
      return true;
    },
  };
}

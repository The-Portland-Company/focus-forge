/**
 * Sentinel stored in `provider_label_name` for a thread pushed to the provider's
 * Junk folder. Junk is a destination, not one of the user's category labels, so
 * it needs a value that can never collide with a real tab name.
 *
 * It doubles as the idempotency marker: a thread carrying it has already been
 * moved provider-side and must never be moved again.
 */
export const SPAM_PROVIDER_LABEL_MARKER = "__spam__";

/**
 * How many already-detected spam threads one sync may push to the provider as
 * catch-up. A backlog drains over a few sync cycles instead of firing one huge
 * IMAP burst that would stall the sync (or trip provider rate limits).
 */
export const SPAM_MIRROR_SWEEP_LIMIT = 100;

export type SpamMirrorCandidateRow = {
  id?: string | number | null;
  status?: string | null;
  classification?: string | null;
  provider_label_name?: string | null;
};

/**
 * Which already-detected spam threads still need pushing to the provider.
 *
 * Quarantine is the auto-detected state; "spam" is the settled one. Both mean
 * "this is junk" as far as the mail account is concerned. A thread already
 * carrying `SPAM_PROVIDER_LABEL_MARKER` has been moved and is skipped, which is
 * what makes the sweep idempotent — it converges to empty instead of re-moving
 * mail on every sync.
 */
export function selectSpamThreadsNeedingProviderMirror(params: {
  rows: SpamMirrorCandidateRow[] | null | undefined;
  /** Threads this sync already mirrored via the touched-thread loop. */
  skipThreadIds?: Iterable<string>;
  limit?: number;
}): string[] {
  const skip = new Set<string>(
    Array.from(params.skipThreadIds || [], (id) => String(id)),
  );
  const limit = params.limit ?? SPAM_MIRROR_SWEEP_LIMIT;
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const row of params.rows || []) {
    if (selected.length >= limit) break;
    if (!row || row.id === null || row.id === undefined) continue;
    const id = String(row.id);
    if (!id || seen.has(id) || skip.has(id)) continue;
    if (row.classification !== "spam") continue;
    if (row.status !== "spam" && row.status !== "quarantine") continue;
    if (row.provider_label_name === SPAM_PROVIDER_LABEL_MARKER) continue;
    seen.add(id);
    selected.push(id);
  }

  return selected;
}

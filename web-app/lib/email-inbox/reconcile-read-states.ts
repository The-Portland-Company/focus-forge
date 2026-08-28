/**
 * Decide each thread's reconciled unread state from the live provider `\Seen`
 * flags pulled during a sync.
 *
 * Why this is a "positive confirmation only" model:
 *
 * Forge derives unread from IMAP — a thread is unread when any of its messages
 * lacks `\Seen`. The per-sync reconcile re-fetches `\Seen` for the recent message
 * window, but the fetch only returns UIDs still present in the folder. The old
 * reconcile defaulted every thread to READ and only flipped it unread when the
 * fetch positively returned an unseen UID; any UID the fetch did NOT return (UID
 * drift, a message that left the folder, batching gaps) silently cleared that
 * thread's unread flag. That is how a Gmail mailbox showing 65 unread collapsed
 * to 18 in Forge.
 *
 * The rule here instead only ever writes a value it can PROVE:
 *   - any message confirmed unseen              -> unread (true)
 *   - every queried message confirmed and seen  -> read   (false)
 *   - otherwise (a message's state is unknown)  -> no update; keep stored value
 *
 * Pure and unit-tested; the DB/IMAP I/O lives in the caller.
 */
export function reconcileThreadReadStates(params: {
  /** thread id → the set of this thread's provider message ids (UIDs) that were
   *  queried this pass. */
  providerIdsByThreadId: Map<string, Set<string>>;
  /** provider message id (UID) → isUnread, ONLY for UIDs the provider returned.
   *  A missing key means the UID's state is unknown. */
  isUnreadByProviderMessageId: Map<string, boolean>;
}): Array<{ threadId: string; isUnread: boolean }> {
  const { providerIdsByThreadId, isUnreadByProviderMessageId } = params;
  const updates: Array<{ threadId: string; isUnread: boolean }> = [];

  providerIdsByThreadId.forEach((providerIds, threadId) => {
    let anyUnseen = false;
    let allConfirmedSeen = true;
    for (const providerId of providerIds) {
      const state = isUnreadByProviderMessageId.get(providerId);
      if (state === undefined) {
        allConfirmedSeen = false; // not returned → unknown, must not clear
        continue;
      }
      if (state) anyUnseen = true;
    }
    if (anyUnseen) {
      updates.push({ threadId, isUnread: true });
    } else if (allConfirmedSeen) {
      updates.push({ threadId, isUnread: false });
    }
    // else: unknown → skip, preserve the stored is_unread
  });

  return updates;
}

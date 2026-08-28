/**
 * Pure core of the read-state reconcile: given the stored (thread, provider UID)
 * message rows and the authoritative set of UNSEEN UIDs the provider reported
 * for the folder, decide which threads are unread and which are read.
 *
 * A thread is unread iff ANY of its messages' UIDs is in the unseen set. Every
 * thread we hold a message for is a candidate — it is either set unread or
 * cleared to read; the DB write scopes this to inbox statuses. Keeping this pure
 * makes the any-unseen logic unit-testable without IMAP or the database.
 */
export function partitionThreadsByUnseen(
  messageRows: Array<{
    thread_id?: string | null;
    provider_message_id?: string | null;
  }>,
  unseenUids: Set<string>,
): { unreadThreadIds: string[]; readThreadIds: string[] } {
  const candidateThreadIds = new Set<string>();
  const unreadThreadIds = new Set<string>();

  for (const row of messageRows) {
    const threadId = String(row.thread_id || "");
    const providerMessageId = String(row.provider_message_id || "");
    if (!threadId || !providerMessageId) continue;
    candidateThreadIds.add(threadId);
    if (unseenUids.has(providerMessageId)) {
      unreadThreadIds.add(threadId);
    }
  }

  const readThreadIds = Array.from(candidateThreadIds).filter(
    (id) => !unreadThreadIds.has(id),
  );

  return { unreadThreadIds: Array.from(unreadThreadIds), readThreadIds };
}

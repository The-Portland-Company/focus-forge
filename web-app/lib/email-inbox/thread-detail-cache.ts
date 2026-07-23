/**
 * In-memory cache of full thread-detail payloads (`/api/email/threads/{id}`),
 * shared between the thread modal and the inbox view.
 *
 * Why: the modal used to refetch the whole conversation and show a blocking
 * spinner on EVERY open, even for a thread read seconds earlier. With the
 * cache, a reopen renders instantly from the last payload and only revalidates
 * (silently) when the inbox row's freshness signal says something changed —
 * i.e. a new message arrived or the thread row was updated.
 *
 * Module-level (not React state): exactly one modal exists, and the realtime
 * patch path in the inbox view needs to invalidate entries without prop
 * plumbing. Session-lifetime only — bodies are too large for localStorage.
 */

/** Minimal freshness signal carried by an inbox list row. */
export type ThreadFreshnessSignal = {
  updatedAt?: string;
  messageCount?: number;
};

export type ThreadDetailCache<T> = {
  get: (threadId: string) => T | null;
  set: (threadId: string, detail: T) => void;
  invalidate: (threadId: string) => void;
  clear: () => void;
  size: () => number;
};

export const THREAD_DETAIL_CACHE_MAX_ENTRIES = 50;

/**
 * Whether a cached detail is still current relative to the (realtime-updated)
 * inbox list row. Missing signals err on the side of revalidating.
 */
export function isThreadDetailFresh(
  cached: ThreadFreshnessSignal | null | undefined,
  listItem: ThreadFreshnessSignal | null | undefined,
): boolean {
  if (!cached || !listItem) return false;
  if (!cached.updatedAt || !listItem.updatedAt) return false;
  if (cached.updatedAt !== listItem.updatedAt) return false;
  if (
    typeof listItem.messageCount === "number" &&
    typeof cached.messageCount === "number" &&
    listItem.messageCount !== cached.messageCount
  ) {
    return false;
  }
  return true;
}

/** Simple LRU keyed by thread id (Map preserves insertion order). */
export function createThreadDetailCache<T>(
  maxEntries: number = THREAD_DETAIL_CACHE_MAX_ENTRIES,
): ThreadDetailCache<T> {
  const entries = new Map<string, T>();

  return {
    get: (threadId) => {
      const entry = entries.get(threadId);
      if (entry === undefined) return null;
      // Refresh recency.
      entries.delete(threadId);
      entries.set(threadId, entry);
      return entry;
    },
    set: (threadId, detail) => {
      entries.delete(threadId);
      entries.set(threadId, detail);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    invalidate: (threadId) => {
      entries.delete(threadId);
    },
    clear: () => entries.clear(),
    size: () => entries.size,
  };
}

/** The app-wide shared instance (typed loosely; the modal narrows it). */
export const sharedThreadDetailCache = createThreadDetailCache<unknown>();

export function invalidateCachedThreadDetail(threadId: string): void {
  sharedThreadDetailCache.invalidate(threadId);
}

import type { Database } from "@/lib/types";

/**
 * Client-side snapshot of the /api/database payload, INCLUDING inbox items.
 *
 * Why this exists — the "inbox empties out on every load" bug: nothing
 * persisted inbox items, so every page load/refresh dropped straight to a
 * skeleton (and then, once the lighter core fetch resolved first, to a false
 * "No inbox work yet." flash) until the email fetch landed. The snapshot lets
 * the app paint the previous session's data at 0ms and treat every fetch as a
 * background revalidate behind the existing header refresh spinner.
 *
 * Design notes:
 * - localStorage (not sessionStorage): the whole point is surviving a reload
 *   and app restart. Keyed per user so switching accounts can't cross wires.
 * - The snapshot is served even when STALE (past the freshness window): a
 *   stale list beats a skeleton, and the revalidate corrects it seconds later.
 *   `isFresh` merely tells callers whether a revalidate is urgent.
 * - Inbox items are capped defensively before writing; the server already
 *   limits the list (~200) but a runaway payload must never brick the cache.
 * - Version bump invalidates old snapshots whenever the stored shape changes.
 *   v2 = first version that persists inboxItems (v1 stripped them).
 */
export const DATABASE_CACHE_VERSION = 2;
/** Snapshots older than this are still hydrated but flagged stale. */
export const DATABASE_CACHE_FRESH_MS = 5 * 60 * 1000;
/** Snapshots older than this are discarded outright (a week-old inbox is more
 *  confusing than a skeleton). */
export const DATABASE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Defensive ceiling on persisted inbox items. */
export const DATABASE_CACHE_MAX_INBOX_ITEMS = 300;

export const getDatabaseCacheKey = (userId?: string | null) =>
  `focus-forge:database-core:v${DATABASE_CACHE_VERSION}:${userId || "anonymous"}`;

/** Storage indirection so tests can run without a browser. */
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const getStorage = (): StorageLike | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export type CachedDatabase = {
  data: Database;
  cachedAt: number;
  /** Within DATABASE_CACHE_FRESH_MS — callers may skip an eager revalidate. */
  isFresh: boolean;
};

export function readCachedDatabase(
  userId?: string | null,
  storage: StorageLike | null = getStorage(),
  now: number = Date.now(),
): CachedDatabase | null {
  if (!storage) return null;

  const key = getDatabaseCacheKey(userId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { cachedAt?: number; data?: Database };
    if (
      typeof parsed.cachedAt !== "number" ||
      !parsed.data ||
      !Array.isArray(parsed.data.tasks) ||
      !Array.isArray(parsed.data.projects) ||
      !Array.isArray(parsed.data.organizations)
    ) {
      storage.removeItem(key);
      return null;
    }
    const age = now - parsed.cachedAt;
    if (age < 0 || age > DATABASE_CACHE_MAX_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    if (!Array.isArray(parsed.data.inboxItems)) {
      parsed.data.inboxItems = [];
    }

    return {
      data: parsed.data,
      cachedAt: parsed.cachedAt,
      isFresh: age <= DATABASE_CACHE_FRESH_MS,
    };
  } catch {
    return null;
  }
}

export function writeCachedDatabase(
  userId: string | null | undefined,
  data: Database,
  storage: StorageLike | null = getStorage(),
  now: number = Date.now(),
): void {
  if (!storage) return;

  try {
    storage.setItem(
      getDatabaseCacheKey(userId),
      JSON.stringify({
        cachedAt: now,
        data: {
          ...data,
          inboxItems: (data.inboxItems ?? []).slice(
            0,
            DATABASE_CACHE_MAX_INBOX_ITEMS,
          ),
        },
      }),
    );
  } catch {
    // Best-effort cache: quota errors etc. must never break the app.
  }
}

/** Drop the user's snapshot (sign-out: localStorage outlives the session). */
export function clearCachedDatabase(
  userId?: string | null,
  storage: StorageLike | null = getStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(getDatabaseCacheKey(userId));
  } catch {
    // ignore
  }
}

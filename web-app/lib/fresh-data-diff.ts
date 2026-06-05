import type { Database } from "@/lib/types";

/**
 * Cheap diff between a previously-displayed database and a freshly fetched one.
 * Returns the set of task ids that are either new (not present before) or whose
 * `updatedAt` changed. Used to briefly highlight background-refreshed rows.
 *
 * Skips entirely (returns an empty set) when there is no previous data — the
 * very first load should never light up every row as "new".
 */
export function diffFreshTaskIds(
  previous: Database | null,
  next: Database,
): Set<string> {
  const fresh = new Set<string>();
  if (!previous) return fresh;

  const prevById = new Map<string, string | undefined>();
  for (const task of previous.tasks) {
    prevById.set(task.id, getUpdatedAt(task));
  }

  for (const task of next.tasks) {
    const prevUpdatedAt = prevById.get(task.id);
    if (prevUpdatedAt === undefined && !prevById.has(task.id)) {
      // New id.
      fresh.add(task.id);
      continue;
    }
    if (prevUpdatedAt !== getUpdatedAt(task)) {
      fresh.add(task.id);
    }
  }

  return fresh;
}

/**
 * Same cheap id → updatedAt diff for email inbox items. Returns ids that are
 * new or changed since the previous render.
 */
export function diffFreshInboxItemIds(
  previous: Database | null,
  next: Database,
): Set<string> {
  const fresh = new Set<string>();
  if (!previous) return fresh;

  const prevById = new Map<string, string | undefined>();
  for (const item of previous.inboxItems) {
    prevById.set(item.id, getUpdatedAt(item));
  }

  for (const item of next.inboxItems) {
    if (!prevById.has(item.id)) {
      fresh.add(item.id);
      continue;
    }
    if (prevById.get(item.id) !== getUpdatedAt(item)) {
      fresh.add(item.id);
    }
  }

  return fresh;
}

function getUpdatedAt(entity: {
  updatedAt?: string;
  updated_at?: string;
}): string | undefined {
  return entity.updatedAt ?? (entity as { updated_at?: string }).updated_at;
}

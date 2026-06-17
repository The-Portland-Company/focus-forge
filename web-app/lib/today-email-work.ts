/**
 * Today → Email Work: pure helpers for sorting/filtering the inbox items shown
 * in the "Email Work" accordion on the Today view, plus localStorage-backed
 * persistence of the user's sort + filter choices.
 *
 * Kept framework-free (no React) so the logic is unit-testable in node:test.
 */

export type TodayEmailSort = "newest" | "oldest";

/** "all" plus the InboxItem.classification union. */
export type TodayEmailClassFilter =
  | "all"
  | "unknown"
  | "actionable"
  | "newsletter"
  | "spam"
  | "waiting"
  | "reference"
  | "transactional";

/** Tri-state suggested-task filter: any / only items with a suggested task /
 *  only items without one. */
export type TodayEmailSuggestedFilter = "all" | "has" | "none";

export const TODAY_EMAIL_SORTS: readonly TodayEmailSort[] = ["newest", "oldest"];

export const TODAY_EMAIL_CLASS_FILTERS: readonly TodayEmailClassFilter[] = [
  "all",
  "actionable",
  "waiting",
  "reference",
  "newsletter",
  "transactional",
  "spam",
  "unknown",
];

export const TODAY_EMAIL_SUGGESTED_FILTERS: readonly TodayEmailSuggestedFilter[] =
  ["all", "has", "none"];

/** Minimal shape needed for filtering/sorting; the real InboxItem is a superset. */
export interface TodayEmailWorkItem {
  classification?: string | null;
  mailboxId?: string | null;
  latestMessageAt?: string | null;
  createdAt?: string | null;
  taskSuggestions?: unknown[] | null;
  derivedTaskCount?: number | null;
}

export interface TodayEmailWorkControls {
  sort: TodayEmailSort;
  classFilter: TodayEmailClassFilter;
  suggestedFilter: TodayEmailSuggestedFilter;
  mailboxFilter: string; // mailbox id or "all"
}

export const DEFAULT_TODAY_EMAIL_WORK_CONTROLS: TodayEmailWorkControls = {
  sort: "newest",
  classFilter: "all",
  suggestedFilter: "all",
  mailboxFilter: "all",
};

/** localStorage keys (kept stable; legacy keys migrated on read below). */
export const TODAY_EMAIL_WORK_KEYS = {
  sort: "todayEmailWork:sort",
  classFilter: "todayEmailWork:filter:class",
  suggestedFilter: "todayEmailWork:filter:suggested",
  mailboxFilter: "todayEmailWork:filter:mailbox",
} as const;

/** Does an item have a suggested (not-yet-created) task? */
export function hasSuggestedTask(item: TodayEmailWorkItem): boolean {
  return Array.isArray(item.taskSuggestions) && item.taskSuggestions.length > 0;
}

function itemTime(item: TodayEmailWorkItem): number {
  const raw = item.latestMessageAt || item.createdAt || 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Apply all filters then sort. Pure: returns a new array, never mutates input.
 * `knownMailboxIds`, when provided, makes the mailbox filter defensive — a
 * persisted mailbox id that no longer exists falls back to showing all.
 */
export function selectTodayEmailWorkItems<T extends TodayEmailWorkItem>(
  items: readonly T[],
  controls: TodayEmailWorkControls,
  knownMailboxIds?: readonly string[],
): T[] {
  const mailboxValid =
    controls.mailboxFilter !== "all" &&
    (!knownMailboxIds || knownMailboxIds.includes(controls.mailboxFilter));

  const filtered = items.filter((item) => {
    if (
      controls.classFilter !== "all" &&
      (item.classification || "unknown") !== controls.classFilter
    ) {
      return false;
    }
    if (controls.suggestedFilter === "has" && !hasSuggestedTask(item)) {
      return false;
    }
    if (controls.suggestedFilter === "none" && hasSuggestedTask(item)) {
      return false;
    }
    if (mailboxValid && item.mailboxId !== controls.mailboxFilter) {
      return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    const at = itemTime(a);
    const bt = itemTime(b);
    return controls.sort === "newest" ? bt - at : at - bt;
  });
}

// ---------------------------------------------------------------------------
// Persistence helpers (SSR/private-mode safe).
// ---------------------------------------------------------------------------

type Storage = Pick<typeof window.localStorage, "getItem" | "setItem">;

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readKey(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Hydrate controls from storage, falling back to defaults for any
 * missing/unknown value. Reads legacy `todayEmailSort` / `todayEmailClass`
 * keys as a migration fallback.
 */
export function loadTodayEmailWorkControls(
  storage?: Storage,
): TodayEmailWorkControls {
  const s = getStorage(storage);
  if (!s) return { ...DEFAULT_TODAY_EMAIL_WORK_CONTROLS };

  const sortRaw =
    readKey(s, TODAY_EMAIL_WORK_KEYS.sort) ?? readKey(s, "todayEmailSort");
  const classRaw =
    readKey(s, TODAY_EMAIL_WORK_KEYS.classFilter) ??
    readKey(s, "todayEmailClass");
  const suggestedRaw = readKey(s, TODAY_EMAIL_WORK_KEYS.suggestedFilter);
  const mailboxRaw = readKey(s, TODAY_EMAIL_WORK_KEYS.mailboxFilter);

  return {
    sort: TODAY_EMAIL_SORTS.includes(sortRaw as TodayEmailSort)
      ? (sortRaw as TodayEmailSort)
      : DEFAULT_TODAY_EMAIL_WORK_CONTROLS.sort,
    classFilter: TODAY_EMAIL_CLASS_FILTERS.includes(
      classRaw as TodayEmailClassFilter,
    )
      ? (classRaw as TodayEmailClassFilter)
      : DEFAULT_TODAY_EMAIL_WORK_CONTROLS.classFilter,
    suggestedFilter: TODAY_EMAIL_SUGGESTED_FILTERS.includes(
      suggestedRaw as TodayEmailSuggestedFilter,
    )
      ? (suggestedRaw as TodayEmailSuggestedFilter)
      : DEFAULT_TODAY_EMAIL_WORK_CONTROLS.suggestedFilter,
    // Mailbox id is free-form; validity (existence) is checked at filter time.
    mailboxFilter: mailboxRaw && mailboxRaw.length > 0
      ? mailboxRaw
      : DEFAULT_TODAY_EMAIL_WORK_CONTROLS.mailboxFilter,
  };
}

function writeKey(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore (private mode / quota).
  }
}

export function saveTodayEmailWorkSort(
  value: TodayEmailSort,
  storage?: Storage,
): void {
  const s = getStorage(storage);
  if (s) writeKey(s, TODAY_EMAIL_WORK_KEYS.sort, value);
}

export function saveTodayEmailWorkClassFilter(
  value: TodayEmailClassFilter,
  storage?: Storage,
): void {
  const s = getStorage(storage);
  if (s) writeKey(s, TODAY_EMAIL_WORK_KEYS.classFilter, value);
}

export function saveTodayEmailWorkSuggestedFilter(
  value: TodayEmailSuggestedFilter,
  storage?: Storage,
): void {
  const s = getStorage(storage);
  if (s) writeKey(s, TODAY_EMAIL_WORK_KEYS.suggestedFilter, value);
}

export function saveTodayEmailWorkMailboxFilter(
  value: string,
  storage?: Storage,
): void {
  const s = getStorage(storage);
  if (s) writeKey(s, TODAY_EMAIL_WORK_KEYS.mailboxFilter, value);
}

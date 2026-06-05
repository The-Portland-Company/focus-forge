/**
 * Per-thread expand/collapse memory for the email thread modal.
 *
 * Conversation messages in the thread modal are collapsed by default. When a
 * user expands individual messages — or hits "Expand All" — we remember that
 * choice per thread so it survives navigation and full page reloads
 * (localStorage). State for thread X never affects thread Y.
 *
 * Persisted value shape (per key `email-thread-expand:{threadId}`):
 *   - the string "all"                  → every message expanded
 *   - a JSON array of message id strings → exactly those messages expanded
 * Anything else (or a missing key) means "all collapsed".
 */

export const EMAIL_THREAD_EXPAND_STORAGE_PREFIX = "email-thread-expand:";

export type ThreadExpandState = "all" | Set<string>;

export function getThreadExpandStorageKey(threadId: string): string {
  return `${EMAIL_THREAD_EXPAND_STORAGE_PREFIX}${threadId}`;
}

/** Parse a raw localStorage value into a normalized expand state. */
export function parseThreadExpandState(
  raw: string | null | undefined,
): ThreadExpandState {
  if (!raw) {
    return new Set<string>();
  }

  if (raw === "all") {
    return "all";
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((id): id is string => typeof id === "string"));
    }
  } catch {
    // Fall through to the empty (all-collapsed) default below.
  }

  return new Set<string>();
}

/** Serialize an expand state for localStorage (or null if it carries nothing). */
export function serializeThreadExpandState(
  state: ThreadExpandState,
): string | null {
  if (state === "all") {
    return "all";
  }

  if (state.size === 0) {
    return null;
  }

  return JSON.stringify(Array.from(state));
}

/** Whether a given message id should render expanded for the current state. */
export function isThreadMessageExpanded(
  state: ThreadExpandState,
  messageId: string,
): boolean {
  return state === "all" || state.has(messageId);
}

/**
 * Whether every message in the thread is currently expanded. Used to decide
 * if the header toggle should read "Collapse All" vs "Expand All".
 */
export function areAllThreadMessagesExpanded(
  state: ThreadExpandState,
  messageIds: string[],
): boolean {
  if (state === "all") {
    return true;
  }

  if (messageIds.length === 0) {
    return false;
  }

  return messageIds.every((id) => state.has(id));
}

/** Toggle a single message's expanded state, returning a new state value. */
export function toggleThreadMessageExpanded(
  state: ThreadExpandState,
  messageId: string,
  messageIds: string[],
): ThreadExpandState {
  // Materialize "all" into an explicit set so collapsing one message works.
  const explicit =
    state === "all" ? new Set(messageIds) : new Set(state);

  if (explicit.has(messageId)) {
    explicit.delete(messageId);
  } else {
    explicit.add(messageId);
  }

  return explicit;
}

/**
 * Read the persisted expand state for a thread. Safe on the server (returns the
 * all-collapsed default when localStorage is unavailable).
 */
export function loadThreadExpandState(threadId: string): ThreadExpandState {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    return parseThreadExpandState(
      window.localStorage.getItem(getThreadExpandStorageKey(threadId)),
    );
  } catch {
    return new Set<string>();
  }
}

/** Persist (or clear) the expand state for a thread. */
export function saveThreadExpandState(
  threadId: string,
  state: ThreadExpandState,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const key = getThreadExpandStorageKey(threadId);
    const serialized = serializeThreadExpandState(state);
    if (serialized === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, serialized);
    }
  } catch {
    // Best-effort; ignore quota / privacy-mode failures.
  }
}

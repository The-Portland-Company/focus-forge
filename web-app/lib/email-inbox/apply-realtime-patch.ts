import type { InboxItem } from "@/lib/types";

/**
 * Realtime patching for the email inbox.
 *
 * Supabase Realtime delivers `postgres_changes` events on `public.email_threads`
 * with REPLICA IDENTITY FULL, so each event carries the full changed row (and the
 * full prior row on DELETE). For the common case — an UPDATE to a thread already
 * in the list — we can patch just that one row in local state instead of
 * refetching the entire inbox.
 *
 * Crucially, several `InboxItem` fields are sourced from OTHER tables and are NOT
 * present on the `email_threads` row: `participants` (email_participants),
 * `derivedTaskCount` (email_thread_tasks), `conversation` (email_messages), and
 * the multi-project `projectIds` (email_thread_projects join). We therefore only
 * patch the scalar fields that live on the row and PRESERVE the rest from the
 * existing item. For a row we don't already have (INSERT, or an UPDATE for a
 * thread not in the list yet) we cannot build a complete row, so we signal the
 * caller to hydrate that single thread instead of rendering a half-populated row.
 */

export type EmailThreadRealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export type EmailThreadRealtimeChange = {
  eventType: EmailThreadRealtimeEventType;
  /** The new row for INSERT/UPDATE (snake_case columns). Null for DELETE. */
  new: Record<string, unknown> | null;
  /** The prior row for DELETE/UPDATE (snake_case columns). May be partial. */
  old: Record<string, unknown> | null;
};

export type EmailThreadRealtimePatchResult = {
  /** The next items array (referentially new only when `changed` is true). */
  items: InboxItem[];
  /** Whether `items` differs from the input. */
  changed: boolean;
  /**
   * A thread id the caller should hydrate via a single-thread fetch
   * (`/api/email/threads/:id`) because the payload lacks fields required to
   * render a new row (participants / task count / conversation).
   */
  hydrateThreadId: string | null;
  /**
   * True when the payload was too incomplete to patch or hydrate confidently
   * and the caller should fall back to a full inbox refresh.
   */
  needsFullRefresh: boolean;
};

function readString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
}

/**
 * Shallow structural equality for the subset of `InboxItem` fields a realtime
 * patch can touch. Arrays are compared element-wise (they are short id/label
 * lists); `taskSuggestions` holds objects, so it falls back to JSON.
 */
function isSameFieldValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => {
      const other = b[index];
      if (value === other) return true;
      if (
        value &&
        other &&
        typeof value === "object" &&
        typeof other === "object"
      ) {
        return JSON.stringify(value) === JSON.stringify(other);
      }
      return false;
    });
  }
  return false;
}

/**
 * True when applying `patch` to `existing` would not change any rendered field.
 *
 * Assigning a project fires our own PUT plus a server-side `reprocessThread()`
 * write, and each of those comes back to the originating client as a
 * `postgres_changes` UPDATE. Without this check every echo produced a brand-new
 * items array (new object identity for the row and the array), re-rendering the
 * whole list for a patch that changed nothing — one of the visible "reload"
 * flashes after a project assignment.
 */
function isNoopPatch(
  existing: InboxItem,
  patch: Partial<InboxItem>,
): boolean {
  return (Object.keys(patch) as (keyof InboxItem)[]).every((key) => {
    // `updated_at` is bumped by every write, including writes that change
    // nothing the list renders (an AI backfill re-saving identical values, the
    // second write inside reprocessThread). Comparing it would defeat this
    // check entirely. It is not rendered — `getInboxItemActivityTime` only
    // falls back to it when every real timestamp is null — and the thread
    // detail cache is invalidated by the realtime handler on every event
    // regardless, so ignoring it here is safe.
    if (key === "updatedAt") return true;
    return isSameFieldValue(existing[key], patch[key]);
  });
}

/**
 * Re-derive the full project id list so the primary `project_id` stays first
 * without dropping the extra links the caller already had loaded.
 */
function mergeProjectIds(
  primaryProjectId: string | null | undefined,
  existing: string[] | undefined,
): string[] {
  const out: string[] = [];
  if (primaryProjectId) out.push(String(primaryProjectId));
  for (const id of existing || []) {
    const value = String(id);
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * Maps an `email_threads` row (snake_case, from a Realtime payload) onto the
 * subset of `InboxItem` fields that live directly on that row. Fields sourced
 * from other tables (participants, derivedTaskCount, messageCount, conversation,
 * and the multi-project projectIds join) are intentionally omitted — callers
 * must preserve those from the existing item or hydrate them separately.
 *
 * NOTE: `messageCount` is deliberately NOT included here. It is derived from
 * email_messages, not present on the email_threads realtime row. Omitting it
 * means the consumer's `{ ...existing, ...patch }` merge preserves the prior
 * count rather than clobbering it with undefined/0.
 */
export function mapEmailThreadRowToInboxPatch(
  row: Record<string, unknown>,
): Partial<InboxItem> {
  const analysisJson = row.analysis_json as
    | { matchedRuleIds?: unknown }
    | null
    | undefined;
  const origin = row.origin;

  return {
    id: String(row.id),
    mailboxId: String(row.mailbox_id),
    projectId: readString(row.project_id),
    ownerUserId: readString(row.owner_user_id),
    summaryProfileId: readString(row.summary_profile_id),
    status: row.status as InboxItem["status"],
    classification: row.classification as InboxItem["classification"],
    resolutionState: row.resolution_state as InboxItem["resolutionState"],
    actionTitle: (row.action_title as string) ?? "",
    subject: (row.subject as string) ?? "",
    normalizedSubject: readString(row.normalized_subject),
    summaryText: readString(row.summary_text),
    previewText: readString(row.preview_text),
    actionConfidence:
      row.action_confidence === null || row.action_confidence === undefined
        ? null
        : Number(row.action_confidence),
    actionReason: readString(row.action_reason),
    latestMessageAt: readString(row.latest_message_at),
    latestInboundAt: readString(row.latest_inbound_at),
    latestOutboundAt: readString(row.latest_outbound_at),
    origin:
      origin === "outbound" || origin === "mixed" ? origin : "inbound",
    isUnread: Boolean(row.is_unread),
    isStarred: Boolean(row.is_starred),
    workDueDate: readString(row.work_due_date),
    workDueTime: readString(row.work_due_time),
    needsProject: Boolean(row.needs_project),
    alwaysDelete: Boolean(row.always_delete),
    matchedRuleIds: Array.isArray(analysisJson?.matchedRuleIds)
      ? analysisJson!.matchedRuleIds
          .map((value: unknown) => String(value || "").trim())
          .filter(Boolean)
      : [],
    taskSuggestions: Array.isArray(row.task_suggestions_json)
      ? (row.task_suggestions_json as InboxItem["taskSuggestions"])
      : [],
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

/**
 * Applies a single Realtime change to the current inbox items.
 *
 * - DELETE → remove by id.
 * - UPDATE of an existing row → patch scalar fields in place, preserving
 *   participants / derivedTaskCount / conversation / extra project links.
 * - INSERT, or UPDATE of a row not in the list → return `hydrateThreadId` so the
 *   caller can fetch the complete row (we can't render participants/tasks from
 *   the threads row alone).
 * - Missing/garbled payload → `needsFullRefresh` so the caller can reconcile.
 *
 * Note: callers do not need to re-sort here — the inbox sorts at render time via
 * `sortInboxItemsForView`, so patching the master list in place is sufficient.
 */
export function applyEmailThreadRealtimeChange(params: {
  items: InboxItem[];
  change: EmailThreadRealtimeChange;
}): EmailThreadRealtimePatchResult {
  const { items, change } = params;
  const noop: EmailThreadRealtimePatchResult = {
    items,
    changed: false,
    hydrateThreadId: null,
    needsFullRefresh: false,
  };

  if (change.eventType === "DELETE") {
    const oldId = readString(change.old?.id);
    if (!oldId) {
      return { ...noop, needsFullRefresh: true };
    }
    const next = items.filter((item) => item.id !== oldId);
    return {
      items: next.length === items.length ? items : next,
      changed: next.length !== items.length,
      hydrateThreadId: null,
      needsFullRefresh: false,
    };
  }

  const row = change.new;
  const rowId = readString(row?.id);
  if (!row || !rowId || !readString(row.mailbox_id)) {
    // Payload is missing the bare minimum to patch — reconcile via full refresh.
    return { ...noop, needsFullRefresh: true };
  }

  const existingIndex = items.findIndex((item) => item.id === rowId);

  if (existingIndex === -1) {
    // New to our list (INSERT, or an UPDATE for a thread we don't have yet).
    // GUARD: never hydrate a soft-deleted thread back into local state. When a
    // user deletes a thread we optimistically drop it from `items`; a later
    // realtime UPDATE for that (now absent) thread — the delete commit itself,
    // or an async AI backfill writing to the deleted row — would otherwise be
    // treated as "new to our list" and resurrected via a single-thread hydrate,
    // producing the reported "deleted email reappears" bug once the client-side
    // pending-removal pin has cleared/expired. A thread the server has marked
    // deleted has no place in the inbox, so drop the event entirely. (A genuine
    // restore-from-trash flips status back to a live value, which is not
    // "deleted" and so still hydrates normally.)
    if (readString(row.status) === "deleted") {
      return noop;
    }
    // participants / task count / conversation aren't on the threads row, so a
    // half-populated row would render broken — hydrate the single thread.
    return {
      items,
      changed: false,
      hydrateThreadId: rowId,
      needsFullRefresh: false,
    };
  }

  const existing = items[existingIndex];
  const patch = mapEmailThreadRowToInboxPatch(row);
  const merged: InboxItem = { ...existing, ...patch };
  merged.projectIds = mergeProjectIds(merged.projectId, existing.projectIds);

  // Echo suppression: an event that would not change a single rendered field
  // must not produce a new items array, otherwise every self-triggered write
  // (our own PUT, then reprocessThread's follow-up write) re-renders the entire
  // list for nothing.
  if (
    isNoopPatch(existing, patch) &&
    isSameFieldValue(existing.projectIds, merged.projectIds)
  ) {
    return noop;
  }

  const next = [...items];
  next[existingIndex] = merged;
  return {
    items: next,
    changed: true,
    hydrateThreadId: null,
    needsFullRefresh: false,
  };
}

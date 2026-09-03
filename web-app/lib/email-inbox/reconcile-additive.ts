import type { InboxItem } from "@/lib/types";

/**
 * Additive-only reconciliation for the email inbox list.
 *
 * The problem: after a page load the inbox keeps mutating for minutes. Every
 * mailbox sync re-enqueues threads for `reprocessThread`, which rewrites
 * `classification` / `status` / `latest_*_at`, one row at a time, and each write
 * arrives over Supabase Realtime (and again on the 60s poll). Because the list
 * filters by status/spam, groups into tabs by classification, and sorts by the
 * latest-activity timestamp, every one of those background writes could make an
 * on-screen row jump, change tab, or vanish — the reported "items keep shifting".
 *
 * The rule the product wants: once the list is painted it stays put, and the
 * only movement allowed is genuinely NEW mail appearing. So between user actions
 * we freeze each rendered row's PLACEMENT fields (what folder/tab it shows in and
 * whether it's hidden) and its SORT timestamps at their first-observed values,
 * while still letting non-positional CONTENT (summary, preview, unread flag, task
 * count, …) update live. Removals and re-files are deferred until the user does
 * something (switches tab, paginates, opens a thread, manually refreshes) — see
 * the flush path in `email-inbox-view.tsx`.
 *
 * A genuinely new message (higher `messageCount`, or a strictly newer inbound /
 * outbound timestamp) is the one exception: that row adopts the fresh values and
 * is allowed to re-sort, because "a new email arrived" is exactly the movement
 * the user expects.
 */

// Fields that decide WHERE a row sits: which folder/tab it belongs to and
// whether it is hidden (spam / archived / quarantine / boomerang). Frozen at the
// rendered value between user actions.
const PLACEMENT_FIELDS = [
  "status",
  "classification",
  "inboxTabId",
  "aiTabVerdicts",
  "boomerangUntil",
  "boomerangTaskId",
  "origin",
  "needsProject",
] as const satisfies readonly (keyof InboxItem)[];

// Fields the list sorts by. Frozen so a background timestamp rewrite can't
// re-order the rendered list.
const SORT_FIELDS = [
  "latestMessageAt",
  "latestInboundAt",
  "latestOutboundAt",
  "createdAt",
] as const satisfies readonly (keyof InboxItem)[];

function ms(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * True when `next` represents a genuinely newer message on the thread (not just
 * a reprocess re-saving the same timestamps). Reprocess writes leave message
 * count and the inbound/outbound timestamps equal, so a STRICT increase is the
 * safe "new email arrived" signal.
 */
function hasNewActivity(rendered: InboxItem, next: InboxItem): boolean {
  if ((next.messageCount ?? 0) > (rendered.messageCount ?? 0)) return true;
  if (ms(next.latestInboundAt) > ms(rendered.latestInboundAt)) return true;
  if (ms(next.latestOutboundAt) > ms(rendered.latestOutboundAt)) return true;
  return false;
}

function freeze<K extends keyof InboxItem>(
  target: InboxItem,
  source: InboxItem,
  key: K,
): void {
  target[key] = source[key];
}

function mergeRow(rendered: InboxItem, next: InboxItem): InboxItem {
  // New mail on this thread: adopt the fresh row wholesale so it may re-sort.
  if (hasNewActivity(rendered, next)) return next;

  // Otherwise: fresh content, frozen placement + sort keys.
  const merged: InboxItem = { ...next };
  for (const key of PLACEMENT_FIELDS) freeze(merged, rendered, key);
  for (const key of SORT_FIELDS) freeze(merged, rendered, key);
  return merged;
}

/**
 * Structural equality over the union of keys, so an unchanged row keeps its
 * object reference and doesn't force a re-render. Mirrors the identity-stability
 * discipline in `apply-realtime-patch.ts`.
 */
function sameRow(a: InboxItem, b: InboxItem): boolean {
  const keys = new Set<keyof InboxItem>([
    ...(Object.keys(a) as (keyof InboxItem)[]),
    ...(Object.keys(b) as (keyof InboxItem)[]),
  ]);
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (av === bv) continue;
    if (
      av &&
      bv &&
      typeof av === "object" &&
      typeof bv === "object" &&
      JSON.stringify(av) === JSON.stringify(bv)
    ) {
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Reconcile a fresh server/realtime list (`next`) onto the currently rendered
 * list (`rendered`) additively:
 *
 * - Row in both → merge content, freeze placement + sort keys (unless new mail).
 * - Row only in `rendered` → keep it (removal deferred to the next flush).
 * - Row only in `next` → append it (new mail is allowed to appear).
 *
 * Returns `rendered` unchanged (same reference) when nothing a render cares about
 * changed. Pending-removal pins must be applied to `next` BEFORE calling this so
 * a user-deleted row (absent from `next`, already dropped from `rendered`) stays
 * gone rather than being treated as a deferred removal.
 */
export function reconcileAdditive(
  rendered: InboxItem[],
  next: InboxItem[],
): InboxItem[] {
  const nextById = new Map(next.map((item) => [item.id, item]));
  const renderedIds = new Set(rendered.map((item) => item.id));

  let changed = false;
  const out: InboxItem[] = [];

  for (const row of rendered) {
    const incoming = nextById.get(row.id);
    if (!incoming) {
      // Missing from the fresh list → defer removal to the next flush.
      out.push(row);
      continue;
    }
    const merged = mergeRow(row, incoming);
    if (sameRow(row, merged)) {
      out.push(row);
    } else {
      out.push(merged);
      changed = true;
    }
  }

  for (const item of next) {
    if (!renderedIds.has(item.id)) {
      out.push(item);
      changed = true;
    }
  }

  return changed ? out : rendered;
}

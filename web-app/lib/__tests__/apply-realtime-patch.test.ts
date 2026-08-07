import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyEmailThreadRealtimeChange,
  mapEmailThreadRowToInboxPatch,
  type EmailThreadRealtimeChange,
} from "../email-inbox/apply-realtime-patch";
import type { InboxItem } from "../types";

function makeItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "t1",
    mailboxId: "m1",
    projectId: null,
    projectIds: [],
    status: "active",
    classification: "actionable",
    resolutionState: "open",
    actionTitle: "Reply",
    subject: "Hello",
    needsProject: false,
    alwaysDelete: false,
    derivedTaskCount: 3,
    messageCount: 5,
    participants: [{ displayName: "Sam", emailAddress: "sam@x.com" } as any],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    isUnread: true,
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    mailbox_id: "m1",
    project_id: null,
    owner_user_id: "u1",
    status: "active",
    classification: "actionable",
    resolution_state: "open",
    action_title: "Reply",
    subject: "Hello",
    is_unread: false,
    is_starred: false,
    needs_project: false,
    always_delete: false,
    latest_message_at: "2026-02-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

test("UPDATE patches scalar fields in place and preserves participants/taskCount", () => {
  const items = [makeItem()];
  const change: EmailThreadRealtimeChange = {
    eventType: "UPDATE",
    new: makeRow({ is_unread: false, subject: "Hello (edited)" }),
    old: makeRow(),
  };

  const result = applyEmailThreadRealtimeChange({ items, change });

  assert.equal(result.changed, true);
  assert.equal(result.hydrateThreadId, null);
  assert.equal(result.needsFullRefresh, false);
  assert.equal(result.items[0].isUnread, false);
  assert.equal(result.items[0].subject, "Hello (edited)");
  // Other-table fields preserved from the existing item.
  assert.equal(result.items[0].derivedTaskCount, 3);
  // messageCount is cross-table-derived and not on the realtime row, so the
  // patch must not clobber it — the existing count survives the merge.
  assert.equal(result.items[0].messageCount, 5);
  assert.equal(result.items[0].participants?.length, 1);
  // Did not mutate input.
  assert.equal(items[0].isUnread, true);
});

test("UPDATE re-derives projectIds keeping primary first and extras intact", () => {
  const items = [makeItem({ projectId: "p1", projectIds: ["p1", "p2"] })];
  const change: EmailThreadRealtimeChange = {
    eventType: "UPDATE",
    new: makeRow({ project_id: "p3", needs_project: false }),
    old: makeRow(),
  };

  const result = applyEmailThreadRealtimeChange({ items, change });
  assert.deepEqual(result.items[0].projectIds, ["p3", "p1", "p2"]);
  assert.equal(result.items[0].projectId, "p3");
});

test("INSERT (unknown id) requests a single-thread hydrate, no list change", () => {
  const items = [makeItem({ id: "t1" })];
  const change: EmailThreadRealtimeChange = {
    eventType: "INSERT",
    new: makeRow({ id: "t2" }),
    old: null,
  };

  const result = applyEmailThreadRealtimeChange({ items, change });
  assert.equal(result.changed, false);
  assert.equal(result.hydrateThreadId, "t2");
  assert.equal(result.needsFullRefresh, false);
  assert.equal(result.items.length, 1);
});

test("UPDATE for a thread not in the list also hydrates", () => {
  const items = [makeItem({ id: "t1" })];
  const change: EmailThreadRealtimeChange = {
    eventType: "UPDATE",
    new: makeRow({ id: "t99" }),
    old: makeRow({ id: "t99" }),
  };

  const result = applyEmailThreadRealtimeChange({ items, change });
  assert.equal(result.hydrateThreadId, "t99");
});

test("DELETE removes by old.id", () => {
  const items = [makeItem({ id: "t1" }), makeItem({ id: "t2" })];
  const change: EmailThreadRealtimeChange = {
    eventType: "DELETE",
    new: null,
    old: { id: "t1" },
  };

  const result = applyEmailThreadRealtimeChange({ items, change });
  assert.equal(result.changed, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "t2");
});

test("DELETE without an id falls back to full refresh", () => {
  const items = [makeItem()];
  const change: EmailThreadRealtimeChange = {
    eventType: "DELETE",
    new: null,
    old: null,
  };

  const result = applyEmailThreadRealtimeChange({ items, change });
  assert.equal(result.needsFullRefresh, true);
  assert.equal(result.changed, false);
});

test("malformed payload (no row) falls back to full refresh", () => {
  const items = [makeItem()];
  const change: EmailThreadRealtimeChange = {
    eventType: "UPDATE",
    new: null,
    old: makeRow(),
  };

  const result = applyEmailThreadRealtimeChange({ items, change });
  assert.equal(result.needsFullRefresh, true);
});

test("mapEmailThreadRowToInboxPatch maps snake_case to InboxItem fields", () => {
  const patch = mapEmailThreadRowToInboxPatch(
    makeRow({
      is_unread: true,
      is_starred: true,
      origin: "mixed",
      analysis_json: { matchedRuleIds: ["r1", "", "r2"] },
      task_suggestions_json: [{ title: "do" }],
    }),
  );

  assert.equal(patch.isUnread, true);
  assert.equal(patch.isStarred, true);
  assert.equal(patch.origin, "mixed");
  assert.deepEqual(patch.matchedRuleIds, ["r1", "r2"]);
  assert.equal(patch.taskSuggestions?.length, 1);
  // Fields from other tables are not produced by the mapper.
  assert.equal((patch as Record<string, unknown>).participants, undefined);
  assert.equal((patch as Record<string, unknown>).derivedTaskCount, undefined);
  assert.equal((patch as Record<string, unknown>).messageCount, undefined);
});

test("UPDATE that changes nothing rendered is suppressed (no re-render)", () => {
  // The self-echo case: assigning a project fires our own PUT plus the
  // server-side reprocessThread() write, and both come back as UPDATEs. An
  // echo carrying identical values must not produce a new items array,
  // otherwise the whole list re-renders for nothing.
  const row = makeRow({ project_id: "p1" });
  const items = [
    makeItem({
      ...mapEmailThreadRowToInboxPatch(row),
      projectIds: ["p1"],
      derivedTaskCount: 3,
      messageCount: 5,
    }),
  ];

  const result = applyEmailThreadRealtimeChange({
    items,
    change: { eventType: "UPDATE", new: row, old: row },
  });

  assert.equal(result.changed, false);
  assert.equal(result.items, items, "items array identity must be preserved");
  assert.equal(result.hydrateThreadId, null);
  assert.equal(result.needsFullRefresh, false);
});

test("UPDATE differing only in updated_at is suppressed", () => {
  const row = makeRow({ project_id: "p1" });
  const items = [
    makeItem({ ...mapEmailThreadRowToInboxPatch(row), projectIds: ["p1"] }),
  ];

  const result = applyEmailThreadRealtimeChange({
    items,
    change: {
      eventType: "UPDATE",
      new: makeRow({ project_id: "p1", updated_at: "2026-02-02T00:00:00Z" }),
      old: row,
    },
  });

  assert.equal(result.changed, false);
  assert.equal(result.items, items);
});

test("UPDATE that adds a project link still applies", () => {
  const items = [makeItem({ projectId: null, projectIds: [] })];

  const result = applyEmailThreadRealtimeChange({
    items,
    change: {
      eventType: "UPDATE",
      new: makeRow({ project_id: "p1", needs_project: false }),
      old: makeRow(),
    },
  });

  assert.equal(result.changed, true);
  assert.equal(result.items[0].projectId, "p1");
  assert.deepEqual(result.items[0].projectIds, ["p1"]);
});

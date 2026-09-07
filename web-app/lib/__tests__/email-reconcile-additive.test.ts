/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { reconcileAdditive } from "../email-inbox/reconcile-additive";
import type { InboxItem } from "../types";

function item(overrides: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    mailboxId: "mb1",
    status: "active",
    classification: "unknown",
    resolutionState: "open",
    actionTitle: "",
    subject: "Subject",
    needsProject: false,
    alwaysDelete: false,
    derivedTaskCount: 0,
    messageCount: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    latestMessageAt: "2026-08-01T00:00:00.000Z",
    latestInboundAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

test("background status change (archived) is frozen — row stays visible", () => {
  const rendered = [item({ id: "a", status: "active" })];
  const next = [item({ id: "a", status: "archived" })];
  const out = reconcileAdditive(rendered, next);
  assert.equal(out[0].status, "active");
});

test("background reclassification (unknown -> transactional) is frozen", () => {
  const rendered = [item({ id: "a", classification: "unknown" })];
  const next = [item({ id: "a", classification: "transactional" })];
  const out = reconcileAdditive(rendered, next);
  // Placement frozen → row does not leave the "All"/unfiled view.
  assert.equal(out[0].classification, "unknown");
});

test("background spam flag is frozen — row is not gated out", () => {
  const rendered = [item({ id: "a", classification: "unknown" })];
  const next = [item({ id: "a", classification: "spam" })];
  const out = reconcileAdditive(rendered, next);
  assert.equal(out[0].classification, "unknown");
});

test("inboxTabId / aiTabVerdicts refile is frozen", () => {
  const rendered = [item({ id: "a", inboxTabId: null, aiTabVerdicts: {} })];
  const next = [
    item({ id: "a", inboxTabId: "tab1", aiTabVerdicts: { q: true } }),
  ];
  const out = reconcileAdditive(rendered, next);
  assert.equal(out[0].inboxTabId, null);
  assert.deepEqual(out[0].aiTabVerdicts, {});
});

test("latest_message_at rewrite alone does not reorder (sort key frozen)", () => {
  const rendered = [
    item({ id: "a", latestMessageAt: "2026-08-01T00:00:00.000Z" }),
  ];
  const next = [item({ id: "a", latestMessageAt: "2026-08-09T00:00:00.000Z" })];
  const out = reconcileAdditive(rendered, next);
  assert.equal(out[0].latestMessageAt, "2026-08-01T00:00:00.000Z");
});

test("content fields (summary/unread/task count) update live", () => {
  const rendered = [
    item({ id: "a", summaryText: "old", isUnread: true, derivedTaskCount: 0 }),
  ];
  const next = [
    item({ id: "a", summaryText: "new", isUnread: false, derivedTaskCount: 2 }),
  ];
  const out = reconcileAdditive(rendered, next);
  assert.equal(out[0].summaryText, "new");
  assert.equal(out[0].isUnread, false);
  assert.equal(out[0].derivedTaskCount, 2);
});

test("a genuinely new inbound message adopts the fresh sort key", () => {
  const rendered = [
    item({
      id: "a",
      messageCount: 1,
      latestInboundAt: "2026-08-01T00:00:00.000Z",
      latestMessageAt: "2026-08-01T00:00:00.000Z",
      status: "active",
    }),
  ];
  const next = [
    item({
      id: "a",
      messageCount: 2,
      latestInboundAt: "2026-08-09T00:00:00.000Z",
      latestMessageAt: "2026-08-09T00:00:00.000Z",
      status: "active",
    }),
  ];
  const out = reconcileAdditive(rendered, next);
  assert.equal(out[0].latestMessageAt, "2026-08-09T00:00:00.000Z");
  assert.equal(out[0].messageCount, 2);
});

test("a row missing from the fresh list is retained (removal deferred)", () => {
  const rendered = [item({ id: "a" }), item({ id: "b" })];
  const next = [item({ id: "a" })];
  const out = reconcileAdditive(rendered, next);
  assert.deepEqual(
    out.map((i) => i.id),
    ["a", "b"],
  );
});

test("a brand-new row is appended (new mail appears)", () => {
  const rendered = [item({ id: "a" })];
  const next = [item({ id: "a" }), item({ id: "b" })];
  const out = reconcileAdditive(rendered, next);
  assert.deepEqual(
    out.map((i) => i.id),
    ["a", "b"],
  );
});

test("no change returns the same array reference", () => {
  const rendered = [item({ id: "a" }), item({ id: "b" })];
  const next = [item({ id: "a" }), item({ id: "b" })];
  const out = reconcileAdditive(rendered, next);
  assert.equal(out, rendered);
});

test("unchanged rows keep their object reference", () => {
  const a = item({ id: "a" });
  const b = item({ id: "b", summaryText: "old" });
  const rendered = [a, b];
  const next = [item({ id: "a" }), item({ id: "b", summaryText: "new" })];
  const out = reconcileAdditive(rendered, next);
  assert.equal(out[0], a); // untouched row: same reference
  assert.notEqual(out[1], b); // content changed: new object
  assert.equal(out[1].summaryText, "new");
});

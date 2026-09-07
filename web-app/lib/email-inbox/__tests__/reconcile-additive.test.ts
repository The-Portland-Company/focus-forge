import { test } from "node:test";
import assert from "node:assert/strict";

import type { InboxItem } from "@/lib/types";
import {
  reconcileAdditive,
  hasNewerServerActivity,
  shouldAutoFlushInbox,
} from "../reconcile-additive";

/**
 * Minimal InboxItem factory. Only the placement / sort / activity fields the
 * reconciler and the auto-flush decision read matter here; the rest are filled
 * with inert defaults and cast, mirroring the other email-inbox unit tests.
 */
function row(partial: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    mailboxId: "mb-1",
    status: "active",
    classification: "actionable",
    resolutionState: "open",
    actionTitle: "",
    subject: "",
    needsProject: false,
    alwaysDelete: false,
    derivedTaskCount: 0,
    messageCount: 1,
    latestMessageAt: "2026-09-01T00:00:00.000Z",
    latestInboundAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  } as unknown as InboxItem;
}

test("hasNewerServerActivity: a strictly newer server thread is detected", () => {
  const rendered = [
    row({ id: "a", latestInboundAt: "2026-09-04T00:00:00.000Z" }),
    row({ id: "b", latestInboundAt: "2026-09-03T00:00:00.000Z" }),
  ];
  // A brand-new thread dated after everything painted.
  const serverTruth = [
    ...rendered,
    row({ id: "c", latestInboundAt: "2026-09-07T00:00:00.000Z" }),
  ];
  assert.equal(hasNewerServerActivity(rendered, serverTruth), true);
});

test("hasNewerServerActivity: no server thread newer than the top is false", () => {
  const rendered = [
    row({ id: "a", latestInboundAt: "2026-09-07T00:00:00.000Z" }),
    row({ id: "b", latestInboundAt: "2026-09-03T00:00:00.000Z" }),
  ];
  // A re-file (placement change) with no new activity — same timestamps.
  const serverTruth = [
    row({ id: "a", latestInboundAt: "2026-09-07T00:00:00.000Z" }),
    row({ id: "b", latestInboundAt: "2026-09-03T00:00:00.000Z", status: "active" }),
  ];
  assert.equal(hasNewerServerActivity(rendered, serverTruth), false);
});

test("shouldAutoFlushInbox: not reading always flushes (re-files surface)", () => {
  // No new activity, only a background re-file — must still auto-flush when the
  // user is not mid-read so the promotion/removal surfaces this poll cycle.
  const rendered = [row({ id: "a", latestInboundAt: "2026-09-07T00:00:00.000Z" })];
  const serverTruth = [
    row({ id: "a", latestInboundAt: "2026-09-07T00:00:00.000Z", status: "archived" }),
  ];
  assert.equal(
    shouldAutoFlushInbox({ reading: false, rendered, serverTruth }),
    true,
  );
});

test("shouldAutoFlushInbox: reading + newer mail flushes (surfaces without action)", () => {
  const rendered = [row({ id: "a", latestInboundAt: "2026-09-04T00:00:00.000Z" })];
  const serverTruth = [
    row({ id: "a", latestInboundAt: "2026-09-04T00:00:00.000Z" }),
    row({ id: "b", latestInboundAt: "2026-09-07T00:00:00.000Z" }),
  ];
  assert.equal(
    shouldAutoFlushInbox({ reading: true, rendered, serverTruth }),
    true,
  );
});

test("shouldAutoFlushInbox: reading + only a re-file stays frozen (no reorder mid-read)", () => {
  const rendered = [
    row({ id: "a", latestInboundAt: "2026-09-07T00:00:00.000Z" }),
    row({ id: "b", latestInboundAt: "2026-09-03T00:00:00.000Z" }),
  ];
  // Same activity, only a placement/classification move — the list must not
  // reshuffle while the user is reading a thread.
  const serverTruth = [
    row({ id: "a", latestInboundAt: "2026-09-07T00:00:00.000Z" }),
    row({
      id: "b",
      latestInboundAt: "2026-09-03T00:00:00.000Z",
      classification: "newsletter",
    }),
  ];
  assert.equal(
    shouldAutoFlushInbox({ reading: true, rendered, serverTruth }),
    false,
  );
});

test("reconcileAdditive: a genuinely new server thread is appended (new mail appears)", () => {
  const rendered = [row({ id: "a" })];
  const next = [row({ id: "a" }), row({ id: "b", latestInboundAt: "2026-09-07T00:00:00.000Z" })];
  const out = reconcileAdditive(rendered, next);
  assert.deepEqual(out.map((r) => r.id), ["a", "b"]);
});

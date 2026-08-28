/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { reconcileThreadReadStates } from "../email-inbox/reconcile-read-states";

function byThread(entries: Record<string, string[]>): Map<string, Set<string>> {
  return new Map(
    Object.entries(entries).map(([threadId, ids]) => [threadId, new Set(ids)]),
  );
}

test("a confirmed-unseen message marks the thread unread", () => {
  const updates = reconcileThreadReadStates({
    providerIdsByThreadId: byThread({ t1: ["10"] }),
    isUnreadByProviderMessageId: new Map([["10", true]]),
  });
  assert.deepEqual(updates, [{ threadId: "t1", isUnread: true }]);
});

test("all messages confirmed seen marks the thread read", () => {
  const updates = reconcileThreadReadStates({
    providerIdsByThreadId: byThread({ t1: ["10", "11"] }),
    isUnreadByProviderMessageId: new Map([
      ["10", false],
      ["11", false],
    ]),
  });
  assert.deepEqual(updates, [{ threadId: "t1", isUnread: false }]);
});

test("any unseen message wins over seen siblings", () => {
  const updates = reconcileThreadReadStates({
    providerIdsByThreadId: byThread({ t1: ["10", "11"] }),
    isUnreadByProviderMessageId: new Map([
      ["10", false],
      ["11", true],
    ]),
  });
  assert.deepEqual(updates, [{ threadId: "t1", isUnread: true }]);
});

test("a UID the provider did not return leaves the thread untouched (the fix)", () => {
  // The bug: this thread's only UID wasn't returned by the live fetch, so the
  // old code cleared it to read. Now it is unknown → no update emitted → the
  // stored is_unread is preserved.
  const updates = reconcileThreadReadStates({
    providerIdsByThreadId: byThread({ t1: ["10"] }),
    isUnreadByProviderMessageId: new Map(), // fetch returned nothing for t1
  });
  assert.deepEqual(updates, []);
});

test("partial confirmation (one seen, one unknown) does not clear to read", () => {
  const updates = reconcileThreadReadStates({
    providerIdsByThreadId: byThread({ t1: ["10", "11"] }),
    isUnreadByProviderMessageId: new Map([["10", false]]), // 11 missing
  });
  // 10 is seen, 11 is unknown → can't prove fully read → skip.
  assert.deepEqual(updates, []);
});

test("partial confirmation still marks unread when a returned UID is unseen", () => {
  const updates = reconcileThreadReadStates({
    providerIdsByThreadId: byThread({ t1: ["10", "11"] }),
    isUnreadByProviderMessageId: new Map([["10", true]]), // 11 missing
  });
  assert.deepEqual(updates, [{ threadId: "t1", isUnread: true }]);
});

test("mixed mailbox: 3 unseen threads survive while read ones clear", () => {
  const updates = reconcileThreadReadStates({
    providerIdsByThreadId: byThread({
      unseenA: ["1"],
      unseenB: ["2"],
      unseenC: ["3"],
      readD: ["4"],
      unknownE: ["5"], // its UID left the folder
    }),
    isUnreadByProviderMessageId: new Map([
      ["1", true],
      ["2", true],
      ["3", true],
      ["4", false],
      // "5" absent → unknown
    ]),
  });
  const map = new Map(updates.map((u) => [u.threadId, u.isUnread]));
  assert.equal(map.get("unseenA"), true);
  assert.equal(map.get("unseenB"), true);
  assert.equal(map.get("unseenC"), true);
  assert.equal(map.get("readD"), false);
  assert.equal(map.has("unknownE"), false); // preserved, not cleared
});

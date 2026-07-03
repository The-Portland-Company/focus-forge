/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PENDING_REMOVAL_MAX_MS,
  applyPendingRemovals,
  clearPendingRemoval,
  isPendingRemoval,
  isPinnableAction,
  markPendingRemoval,
  type PendingRemovals,
  type ThreadStatusRow,
} from "../email-inbox/pending-removals";

const T0 = 1_000_000; // fixed base "now" so tests are deterministic

function row(id: string, status: string): ThreadStatusRow {
  return { id, status };
}

test("only lagging provider-move actions are pinnable", () => {
  assert.equal(isPinnableAction("delete"), true);
  assert.equal(isPinnableAction("always_delete_sender"), true);
  assert.equal(isPinnableAction("archive"), true);
  assert.equal(isPinnableAction("spam"), true);
  // App-only actions don't lag a provider commit, so they are not pinned.
  assert.equal(isPinnableAction("quarantine"), false);
  assert.equal(isPinnableAction("mark_read"), false);
  assert.equal(isPinnableAction("approve"), false);
});

test("markPendingRemoval ignores non-pinnable actions", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "t1", "mark_read", T0);
  assert.equal(map.size, 0);
});

test("a pre-commit refetch keeps the deleted row hidden (the flicker fix)", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "t1", "delete", T0);

  // Server hasn't committed yet: refetch still returns the thread as active.
  const fresh = [row("t1", "active"), row("t2", "active")];
  const visible = applyPendingRemovals(map, fresh, T0 + 3_000);

  assert.deepEqual(
    visible.map((r) => r.id),
    ["t2"],
    "deleted thread must stay dropped while the server is still pre-commit",
  );
  // Pin is retained so the NEXT stale refetch also stays suppressed.
  assert.equal(isPendingRemoval(map, "t1", T0 + 3_000), true);
});

test("the fixed-timer flicker cannot recur: pin outlives a slow provider move", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "t1", "delete", T0);

  // 30s later — well past the old 12s tombstone — the server is STILL
  // pre-commit (slow IMAP). The old code would have let the row reappear here.
  const late = applyPendingRemovals(map, [row("t1", "active")], T0 + 30_000);
  assert.deepEqual(late.map((r) => r.id), []);
});

test("commit is confirmed by terminal status → pin clears, row segments normally", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "t1", "delete", T0);

  // Server committed: the thread now comes back with status "deleted".
  const fresh = [row("t1", "deleted"), row("t2", "active")];
  const visible = applyPendingRemovals(map, fresh, T0 + 5_000);

  assert.deepEqual(
    visible.map((r) => r.id),
    ["t1", "t2"],
    "once committed, the deleted row is kept so it can show in the Trash view",
  );
  assert.equal(map.has("t1"), false, "pin cleared after confirmation");
});

test("archive and spam use the same mechanism with their own terminal status", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "a", "archive", T0);
  markPendingRemoval(map, "s", "spam", T0);

  // Pre-commit: both still active → both suppressed from the active inbox.
  let visible = applyPendingRemovals(
    map,
    [row("a", "active"), row("s", "active"), row("keep", "active")],
    T0 + 1_000,
  );
  assert.deepEqual(visible.map((r) => r.id), ["keep"]);

  // Committed: each reaches its own terminal status → pins clear, rows kept.
  visible = applyPendingRemovals(
    map,
    [row("a", "archived"), row("s", "spam")],
    T0 + 2_000,
  );
  assert.deepEqual(visible.map((r) => r.id).sort(), ["a", "s"]);
  assert.equal(map.size, 0);
});

test("a row that leaves the list entirely (e.g. emptied trash) clears its pin", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "t1", "delete", T0);

  const visible = applyPendingRemovals(map, [row("t2", "active")], T0 + 1_000);
  assert.deepEqual(visible.map((r) => r.id), ["t2"]);
  assert.equal(map.has("t1"), false, "absent-from-list counts as confirmed gone");
});

test("the ceiling force-drops a pin that never gets confirmed", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "t1", "delete", T0);

  // Past the ceiling and the server STILL shows it active (commit never landed):
  // stop suppressing so the row can't vanish forever.
  const visible = applyPendingRemovals(
    map,
    [row("t1", "active")],
    T0 + PENDING_REMOVAL_MAX_MS + 1,
  );
  assert.deepEqual(visible.map((r) => r.id), ["t1"]);
  assert.equal(map.has("t1"), false);
});

test("isPendingRemoval prunes expired entries as a side effect", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "t1", "delete", T0);
  assert.equal(isPendingRemoval(map, "t1", T0 + 1_000), true);
  assert.equal(isPendingRemoval(map, "t1", T0 + PENDING_REMOVAL_MAX_MS + 1), false);
  assert.equal(map.has("t1"), false);
});

test("clearPendingRemoval drops a pin (failed-action restore path)", () => {
  const map: PendingRemovals = new Map();
  markPendingRemoval(map, "t1", "delete", T0);
  clearPendingRemoval(map, "t1");
  assert.equal(isPendingRemoval(map, "t1", T0 + 1_000), false);
});

test("applyPendingRemovals is a no-op passthrough when nothing is pinned", () => {
  const map: PendingRemovals = new Map();
  const fresh = [row("t1", "active")];
  assert.equal(applyPendingRemovals(map, fresh, T0), fresh);
});

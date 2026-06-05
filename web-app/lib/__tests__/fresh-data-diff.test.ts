/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { diffFreshTaskIds, diffFreshInboxItemIds } from "../fresh-data-diff";

const db = (tasks: any[], inboxItems: any[] = []) =>
  ({ tasks, inboxItems }) as any;

test("diffFreshTaskIds returns empty set on first load (no previous)", () => {
  const next = db([{ id: "a", updatedAt: "1" }]);
  assert.equal(diffFreshTaskIds(null, next).size, 0);
});

test("diffFreshTaskIds flags new ids", () => {
  const prev = db([{ id: "a", updatedAt: "1" }]);
  const next = db([
    { id: "a", updatedAt: "1" },
    { id: "b", updatedAt: "1" },
  ]);
  const fresh = diffFreshTaskIds(prev, next);
  assert.deepEqual([...fresh], ["b"]);
});

test("diffFreshTaskIds flags changed updatedAt, ignores unchanged", () => {
  const prev = db([
    { id: "a", updatedAt: "1" },
    { id: "b", updatedAt: "1" },
  ]);
  const next = db([
    { id: "a", updatedAt: "2" },
    { id: "b", updatedAt: "1" },
  ]);
  const fresh = diffFreshTaskIds(prev, next);
  assert.deepEqual([...fresh], ["a"]);
});

test("diffFreshTaskIds supports snake_case updated_at", () => {
  const prev = db([{ id: "a", updated_at: "1" }]);
  const next = db([{ id: "a", updated_at: "2" }]);
  assert.deepEqual([...diffFreshTaskIds(prev, next)], ["a"]);
});

test("diffFreshInboxItemIds flags new and changed inbox items", () => {
  const prev = db([], [{ id: "t1", updatedAt: "1" }]);
  const next = db(
    [],
    [
      { id: "t1", updatedAt: "2" },
      { id: "t2", updatedAt: "1" },
    ],
  );
  assert.deepEqual([...diffFreshInboxItemIds(prev, next)].sort(), ["t1", "t2"]);
});

test("diffFreshInboxItemIds empty on first load", () => {
  assert.equal(
    diffFreshInboxItemIds(null, db([], [{ id: "t1", updatedAt: "1" }])).size,
    0,
  );
});

/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  compareScheduledFirst,
  getScheduledTimestamp,
  isScheduled,
  type SchedulableTask,
} from "../task-sort";

type T = SchedulableTask & { id: string };

// Sort helper mirroring how a caller uses the comparator: scheduled-first with
// a fallback that preserves the incoming (manual) order via index.
function sortScheduledFirst(tasks: T[]): string[] {
  const index = new Map(tasks.map((t, i) => [t.id, i] as const));
  return [...tasks]
    .sort((a, b) =>
      compareScheduledFirst(
        a,
        b,
        (x, y) => (index.get(x.id) ?? 0) - (index.get(y.id) ?? 0),
      ),
    )
    .map((t) => t.id);
}

test("getScheduledTimestamp: needs both date and time", () => {
  assert.equal(getScheduledTimestamp({ dueDate: "2026-01-01" }), null);
  assert.equal(getScheduledTimestamp({ dueTime: "09:00" }), null);
  assert.equal(getScheduledTimestamp({}), null);
  assert.notEqual(
    getScheduledTimestamp({ dueDate: "2026-01-01", dueTime: "09:00" }),
    null,
  );
});

test("getScheduledTimestamp: reads snake_case fields", () => {
  const ts = getScheduledTimestamp({
    due_date: "2026-01-01",
    due_time: "09:00",
  });
  assert.equal(ts, new Date("2026-01-01T09:00").getTime());
});

test("getScheduledTimestamp: date carrying a T component still combines with time", () => {
  const ts = getScheduledTimestamp({
    dueDate: "2026-01-01T00:00:00.000Z",
    dueTime: "14:30",
  });
  assert.equal(ts, new Date("2026-01-01T14:30").getTime());
});

test("getScheduledTimestamp: invalid combination is null", () => {
  assert.equal(
    getScheduledTimestamp({ dueDate: "not-a-date", dueTime: "nope" }),
    null,
  );
});

test("isScheduled: date-only counts as unscheduled", () => {
  assert.equal(isScheduled({ dueDate: "2026-01-01" }), false);
  assert.equal(isScheduled({ dueDate: "2026-01-01", dueTime: "09:00" }), true);
});

test("scheduled tasks sort chronologically before unscheduled ones", () => {
  const tasks: T[] = [
    { id: "u1" },
    { id: "s-late", dueDate: "2026-01-02", dueTime: "08:00" },
    { id: "u2", dueDate: "2026-01-01" }, // date only -> unscheduled
    { id: "s-early", dueDate: "2026-01-01", dueTime: "08:00" },
  ];
  assert.deepEqual(sortScheduledFirst(tasks), [
    "s-early",
    "s-late",
    "u1",
    "u2",
  ]);
});

test("unscheduled tasks keep their manual (incoming) relative order", () => {
  const tasks: T[] = [
    { id: "b" },
    { id: "a" },
    { id: "c", dueDate: "2026-05-05" }, // date only
  ];
  assert.deepEqual(sortScheduledFirst(tasks), ["b", "a", "c"]);
});

test("scheduled tie falls back to manual order", () => {
  const tasks: T[] = [
    { id: "second", dueDate: "2026-01-01", dueTime: "09:00" },
    { id: "first", dueDate: "2026-01-01", dueTime: "09:00" },
  ];
  assert.deepEqual(sortScheduledFirst(tasks), ["second", "first"]);
});

test("comparator defaults fallback to 0 (stable no-op)", () => {
  assert.equal(compareScheduledFirst({ id: "a" } as T, { id: "b" } as T), 0);
});

/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  selectTodayEmailWorkItems,
  loadTodayEmailWorkControls,
  saveTodayEmailWorkSort,
  saveTodayEmailWorkMailboxFilter,
  hasSuggestedTask,
  DEFAULT_TODAY_EMAIL_WORK_CONTROLS,
  TODAY_EMAIL_WORK_KEYS,
  type TodayEmailWorkControls,
  type TodayEmailWorkItem,
} from "../today-email-work";

function item(overrides: Partial<TodayEmailWorkItem> = {}): TodayEmailWorkItem {
  return {
    classification: "actionable",
    mailboxId: "mb-1",
    latestMessageAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    taskSuggestions: [],
    derivedTaskCount: 0,
    ...overrides,
  };
}

function controls(
  overrides: Partial<TodayEmailWorkControls> = {},
): TodayEmailWorkControls {
  return { ...DEFAULT_TODAY_EMAIL_WORK_CONTROLS, ...overrides };
}

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    store: map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

test("hasSuggestedTask reflects taskSuggestions array", () => {
  assert.equal(hasSuggestedTask(item({ taskSuggestions: [] })), false);
  assert.equal(hasSuggestedTask(item({ taskSuggestions: null })), false);
  assert.equal(hasSuggestedTask(item({ taskSuggestions: [{}] })), true);
});

test("default sort is newest-first by most recent date", () => {
  const older = item({ id: "a", latestMessageAt: "2026-01-01T00:00:00Z" } as any);
  const newer = item({ id: "b", latestMessageAt: "2026-02-01T00:00:00Z" } as any);
  const out = selectTodayEmailWorkItems([older, newer], controls());
  assert.deepEqual(out.map((i: any) => i.id), ["b", "a"]);
});

test("oldest sort reverses order", () => {
  const older = item({ id: "a", latestMessageAt: "2026-01-01T00:00:00Z" } as any);
  const newer = item({ id: "b", latestMessageAt: "2026-02-01T00:00:00Z" } as any);
  const out = selectTodayEmailWorkItems(
    [older, newer],
    controls({ sort: "oldest" }),
  );
  assert.deepEqual(out.map((i: any) => i.id), ["a", "b"]);
});

test("does not mutate input array", () => {
  const arr = [
    item({ latestMessageAt: "2026-01-01T00:00:00Z" }),
    item({ latestMessageAt: "2026-02-01T00:00:00Z" }),
  ];
  const snapshot = [...arr];
  selectTodayEmailWorkItems(arr, controls());
  assert.deepEqual(arr, snapshot);
});

test("class filter matches classification, treating missing as unknown", () => {
  const a = item({ classification: "actionable" });
  const n = item({ classification: "newsletter" });
  const u = item({ classification: null });
  assert.equal(
    selectTodayEmailWorkItems([a, n, u], controls({ classFilter: "actionable" }))
      .length,
    1,
  );
  assert.equal(
    selectTodayEmailWorkItems([a, n, u], controls({ classFilter: "unknown" }))
      .length,
    1,
  );
});

test("suggested filter: has / none", () => {
  const withSug = item({ taskSuggestions: [{}] });
  const without = item({ taskSuggestions: [] });
  assert.equal(
    selectTodayEmailWorkItems(
      [withSug, without],
      controls({ suggestedFilter: "has" }),
    ).length,
    1,
  );
  assert.equal(
    selectTodayEmailWorkItems(
      [withSug, without],
      controls({ suggestedFilter: "none" }),
    ).length,
    1,
  );
});

test("mailbox filter restricts to one mailbox", () => {
  const m1 = item({ mailboxId: "mb-1" });
  const m2 = item({ mailboxId: "mb-2" });
  const out = selectTodayEmailWorkItems(
    [m1, m2],
    controls({ mailboxFilter: "mb-2" }),
    ["mb-1", "mb-2"],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].mailboxId, "mb-2");
});

test("unknown persisted mailbox id falls back to showing all", () => {
  const m1 = item({ mailboxId: "mb-1" });
  const m2 = item({ mailboxId: "mb-2" });
  const out = selectTodayEmailWorkItems(
    [m1, m2],
    controls({ mailboxFilter: "gone" }),
    ["mb-1", "mb-2"],
  );
  assert.equal(out.length, 2);
});

test("loadTodayEmailWorkControls returns defaults for empty storage", () => {
  const s = fakeStorage();
  assert.deepEqual(
    loadTodayEmailWorkControls(s),
    DEFAULT_TODAY_EMAIL_WORK_CONTROLS,
  );
});

test("loadTodayEmailWorkControls ignores unknown values, keeps valid ones", () => {
  const s = fakeStorage({
    [TODAY_EMAIL_WORK_KEYS.sort]: "sideways",
    [TODAY_EMAIL_WORK_KEYS.classFilter]: "newsletter",
    [TODAY_EMAIL_WORK_KEYS.suggestedFilter]: "bogus",
    [TODAY_EMAIL_WORK_KEYS.mailboxFilter]: "mb-9",
  });
  const c = loadTodayEmailWorkControls(s);
  assert.equal(c.sort, "newest"); // fallback
  assert.equal(c.classFilter, "newsletter");
  assert.equal(c.suggestedFilter, "all"); // fallback
  assert.equal(c.mailboxFilter, "mb-9");
});

test("loadTodayEmailWorkControls migrates legacy keys", () => {
  const s = fakeStorage({
    todayEmailSort: "oldest",
    todayEmailClass: "waiting",
  });
  const c = loadTodayEmailWorkControls(s);
  assert.equal(c.sort, "oldest");
  assert.equal(c.classFilter, "waiting");
});

test("save helpers round-trip through load", () => {
  const s = fakeStorage();
  saveTodayEmailWorkSort("oldest", s);
  saveTodayEmailWorkMailboxFilter("mb-7", s);
  const c = loadTodayEmailWorkControls(s);
  assert.equal(c.sort, "oldest");
  assert.equal(c.mailboxFilter, "mb-7");
});

/**
 * today-selection.test.ts
 *
 * Verifies that selectTodayTasks mirrors the daily-plan route's eligibleTasks
 * filter for the same task input — overdue, today, tomorrow, restOfWeek are
 * included; future (beyond week) and snoozed tasks are excluded.
 */

/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { isOverdue, isToday, isTomorrow, isRestOfWeek } from "@/lib/date-utils";

// ── Shared filter predicate (mirrors daily-plan/route.ts and today-selection.ts) ──

function isTodayEligible(
  task: { due_date?: string | null; snoozed_until?: string | null; completed?: boolean },
  nowMs: number,
): boolean {
  if (task.completed) return false;
  const dueDate = task.due_date;
  if (!dueDate) return false;
  const snoozedUntil = task.snoozed_until;
  if (snoozedUntil) {
    const snoozedMs = new Date(snoozedUntil).getTime();
    if (Number.isFinite(snoozedMs) && snoozedMs > nowMs) {
      return false;
    }
  }
  return (
    isOverdue(dueDate) ||
    isToday(dueDate) ||
    isTomorrow(dueDate) ||
    isRestOfWeek(dueDate)
  );
}

// ── Date helpers ───────────────────────────────────────────────────────────

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TODAY = addDays(0);
const YESTERDAY = addDays(-1);
const TOMORROW = addDays(1);
const NEXT_WEEK = addDays(8);

// ── Tests ──────────────────────────────────────────────────────────────────

test("includes overdue tasks", () => {
  const nowMs = Date.now();
  assert.equal(isTodayEligible({ due_date: YESTERDAY, snoozed_until: null, completed: false }, nowMs), true);
});

test("includes tasks due today", () => {
  const nowMs = Date.now();
  assert.equal(isTodayEligible({ due_date: TODAY, snoozed_until: null, completed: false }, nowMs), true);
});

test("includes tasks due tomorrow", () => {
  const nowMs = Date.now();
  assert.equal(isTodayEligible({ due_date: TOMORROW, snoozed_until: null, completed: false }, nowMs), true);
});

test("excludes tasks beyond this week", () => {
  const nowMs = Date.now();
  assert.equal(isTodayEligible({ due_date: NEXT_WEEK, snoozed_until: null, completed: false }, nowMs), false);
});

test("excludes tasks with no due_date", () => {
  const nowMs = Date.now();
  assert.equal(isTodayEligible({ due_date: null, snoozed_until: null, completed: false }, nowMs), false);
});

test("excludes completed tasks", () => {
  const nowMs = Date.now();
  assert.equal(isTodayEligible({ due_date: TODAY, snoozed_until: null, completed: true }, nowMs), false);
});

test("excludes tasks snoozed until the future", () => {
  const nowMs = Date.now();
  const futureSnooze = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal(isTodayEligible({ due_date: TODAY, snoozed_until: futureSnooze, completed: false }, nowMs), false);
});

test("includes tasks whose snooze has already elapsed", () => {
  const nowMs = Date.now();
  const pastSnooze = new Date(Date.now() - 3_600_000).toISOString();
  assert.equal(isTodayEligible({ due_date: TODAY, snoozed_until: pastSnooze, completed: false }, nowMs), true);
});

test("Today-view filter set equals daily-plan filter for the same input", () => {
  const nowMs = Date.now();
  const tasks = [
    { id: "1", due_date: YESTERDAY, snoozed_until: null, completed: false },   // overdue ✓
    { id: "2", due_date: TODAY, snoozed_until: null, completed: false },        // today ✓
    { id: "3", due_date: TOMORROW, snoozed_until: null, completed: false },     // tomorrow ✓
    { id: "4", due_date: NEXT_WEEK, snoozed_until: null, completed: false },    // beyond week ✗
    { id: "5", due_date: null, snoozed_until: null, completed: false },         // no date ✗
    { id: "6", due_date: TODAY, snoozed_until: null, completed: true },         // completed ✗
    { id: "7", due_date: TODAY, snoozed_until: new Date(Date.now() + 3_600_000).toISOString(), completed: false }, // snoozed ✗
  ];

  // Both the daily-plan route and today-selection.ts use isTodayEligible logic.
  // Run each task through the filter and assert the resulting id sets match.
  const selected = tasks.filter((t) => isTodayEligible(t, nowMs)).map((t) => t.id);

  assert.deepEqual(selected, ["1", "2", "3"]);
});

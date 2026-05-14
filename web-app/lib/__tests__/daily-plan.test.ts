/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import type {
  DailyPlanResponse,
  DailyPlanOrderedItem,
  DailyPlanDeferredItem,
  DailyPlanEstimateProposal,
} from "../daily-plan/types";

// Local mirror of the shape that the today-view filter applies. We copy the
// minimal logic here so the test can run without spinning up the page module.
function shouldHideTaskFromToday(task: {
  completed?: boolean;
  due_date?: string | null;
  snoozed_until?: string | null;
}, nowMs: number): boolean {
  if (task.completed) return true;
  if (!task.due_date) return true;
  if (task.snoozed_until) {
    const snoozedMs = new Date(task.snoozed_until).getTime();
    if (Number.isFinite(snoozedMs) && snoozedMs > nowMs) return true;
  }
  return false;
}

test("snoozed tasks with future timestamp are hidden from Today", () => {
  const now = new Date("2026-05-08T12:00:00.000Z").getTime();
  assert.equal(
    shouldHideTaskFromToday(
      {
        due_date: "2026-05-08",
        snoozed_until: "2026-05-09T08:00:00.000Z",
      },
      now,
    ),
    true,
  );
});

test("snoozed tasks with past timestamp surface again on Today", () => {
  const now = new Date("2026-05-08T12:00:00.000Z").getTime();
  assert.equal(
    shouldHideTaskFromToday(
      {
        due_date: "2026-05-08",
        snoozed_until: "2026-05-07T08:00:00.000Z",
      },
      now,
    ),
    false,
  );
});

test("undated tasks are not eligible for Today regardless of snooze", () => {
  const now = Date.now();
  assert.equal(
    shouldHideTaskFromToday({ due_date: null, snoozed_until: null }, now),
    true,
  );
});

test("DailyPlanResponse type accepts well-formed payload", () => {
  const ordered: DailyPlanOrderedItem = {
    kind: "task",
    id: "task-1",
    rank: 1,
    estimateMinutes: 45,
    rationale: "Top priority — overdue.",
    suggestedStart: null,
    suggestedEnd: null,
  };
  const deferred: DailyPlanDeferredItem = {
    kind: "inbox_item",
    id: "thread-9",
    suggestedSnoozeUntil: "2026-05-09T15:00:00.000Z",
    reason: "Low urgency newsletter",
  };
  const estimate: DailyPlanEstimateProposal = {
    taskId: "task-2",
    minutes: 30,
    confidence: "med",
  };
  const plan: DailyPlanResponse = {
    date: "2026-05-08",
    capacityMinutes: 300,
    plannedMinutes: 45,
    overflowMinutes: 0,
    orderedItems: [ordered],
    deferred: [deferred],
    estimatesProposed: [estimate],
    generatedAt: "2026-05-08T12:00:00.000Z",
  };
  assert.equal(plan.orderedItems[0].id, "task-1");
  assert.equal(plan.deferred[0].kind, "inbox_item");
  assert.equal(plan.estimatesProposed[0].confidence, "med");
});

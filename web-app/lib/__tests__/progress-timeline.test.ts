/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectProgressTimeline } from "../progress-timeline";
import type { Project, Task } from "../types";

const project: Project = {
  id: "proj-1",
  name: "Website Redesign",
  color: "#3b82f6",
  organizationId: "org-1",
  isFavorite: false,
  createdAt: "2026-01-10T12:00:00.000Z",
  updatedAt: "2026-01-10T12:00:00.000Z",
};

function makeTask(overrides: Omit<Partial<Task>, "id"> & { id: string }): Task {
  const { id, ...rest } = overrides;
  return {
    name: "Task",
    priority: 4,
    reminders: [],
    files: [],
    projectId: "proj-1",
    tags: [],
    completed: false,
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-01-10T12:00:00.000Z",
    ...rest,
    id,
  };
}

test("uses earliest due date when it is older than today", () => {
  const tasks: Task[] = [
    makeTask({
      id: "t1",
      dueDate: "2025-12-20",
      createdAt: "2025-12-21T12:00:00.000Z",
    }),
  ];

  const result = buildProjectProgressTimeline(
    project,
    tasks,
    new Date("2026-01-15T12:00:00.000Z"),
  );

  assert.equal(result.startDate, "2025-12-20");
  assert.equal(result.endDate, "2026-01-15");
});

test("uses today when all due dates are in the future", () => {
  const tasks: Task[] = [
    makeTask({
      id: "t1",
      dueDate: "2026-02-20",
      createdAt: "2026-01-11T12:00:00.000Z",
    }),
  ];

  const result = buildProjectProgressTimeline(
    project,
    tasks,
    new Date("2026-01-15T12:00:00.000Z"),
  );

  assert.equal(result.startDate, "2026-01-15");
  assert.equal(result.points.length, 1);
});

test("falls back to project createdAt when due dates are missing", () => {
  const tasks: Task[] = [makeTask({ id: "t1" })];

  const result = buildProjectProgressTimeline(
    project,
    tasks,
    new Date("2026-01-12T12:00:00.000Z"),
  );

  assert.equal(result.startDate, "2026-01-10");
});

test("includes subtasks in total and completed counts", () => {
  const tasks: Task[] = [
    makeTask({ id: "parent", createdAt: "2026-01-10T12:00:00.000Z" }),
    makeTask({
      id: "child",
      parentId: "parent",
      createdAt: "2026-01-10T12:00:00.000Z",
      completed: true,
      completedAt: "2026-01-11T12:00:00.000Z",
    }),
  ];

  const result = buildProjectProgressTimeline(
    project,
    tasks,
    new Date("2026-01-11T12:00:00.000Z"),
  );
  const last = result.points[result.points.length - 1];

  assert.equal(last.totalCount, 2);
  assert.equal(last.completedCount, 1);
  assert.equal(last.completionPct, 50);
});

test("computes daily completion percentages over time", () => {
  const tasks: Task[] = [
    makeTask({ id: "t1", createdAt: "2026-01-10T12:00:00.000Z" }),
    makeTask({
      id: "t2",
      createdAt: "2026-01-11T12:00:00.000Z",
      completed: true,
      completedAt: "2026-01-12T12:00:00.000Z",
    }),
  ];

  const result = buildProjectProgressTimeline(
    project,
    tasks,
    new Date("2026-01-12T12:00:00.000Z"),
  );

  const day1 = result.points.find((p) => p.date === "2026-01-10");
  const day2 = result.points.find((p) => p.date === "2026-01-11");
  const day3 = result.points.find((p) => p.date === "2026-01-12");

  assert.equal(day1?.completionPct, 0);
  assert.equal(day2?.completionPct, 0);
  assert.equal(day3?.completionPct, 50);
});

test("ignores invalid created/completed dates safely", () => {
  const tasks: Task[] = [
    makeTask({ id: "t1", createdAt: "not-a-date" as unknown as string }),
    makeTask({
      id: "t2",
      completed: true,
      completedAt: "still-not-a-date",
    }),
  ];

  const result = buildProjectProgressTimeline(
    project,
    tasks,
    new Date("2026-01-12T12:00:00.000Z"),
  );
  const last = result.points[result.points.length - 1];

  assert.equal(last.totalCount, 1);
  assert.equal(last.completedCount, 0);
  assert.equal(last.completionPct, 0);
});

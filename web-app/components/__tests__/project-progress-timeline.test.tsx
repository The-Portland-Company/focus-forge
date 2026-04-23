/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectProgressTimeline } from "../project-progress-timeline";
import type { Project, Task } from "../../lib/types";

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

test("renders empty state when project has no tasks", () => {
  const html = renderToStaticMarkup(
    <ProjectProgressTimeline
      project={project}
      tasks={[]}
      today={new Date("2026-01-12T12:00:00.000Z")}
    />,
  );

  assert.match(html, /No tasks yet for this project\./);
  assert.match(html, /Progress Timeline/);
});

test("renders summary stats and timeline date range", () => {
  const tasks = [
    makeTask({ id: "t1", completed: true, completedAt: "2026-01-11T12:00:00.000Z" }),
    makeTask({ id: "t2", createdAt: "2026-01-11T12:00:00.000Z" }),
  ];

  const html = renderToStaticMarkup(
    <ProjectProgressTimeline
      project={project}
      tasks={tasks}
      today={new Date("2026-01-12T12:00:00.000Z")}
    />,
  );

  assert.match(html, /Total:/);
  assert.match(html, /Incomplete:/);
  assert.match(html, /Completed:/);
  assert.match(html, /2026-01-10 to 2026-01-12/);
});

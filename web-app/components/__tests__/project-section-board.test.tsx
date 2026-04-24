/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectSectionBoard } from "../project-section-board";
import type { Database, Project, Section, Task } from "../../lib/types";

const project: Project = {
  id: "proj-1",
  name: "Website Redesign",
  color: "#3b82f6",
  organizationId: "org-1",
  isFavorite: false,
  createdAt: "2026-01-10T12:00:00.000Z",
  updatedAt: "2026-01-10T12:00:00.000Z",
};

const section: Section = {
  id: "section-1",
  name: "Design",
  projectId: project.id,
  color: "#22c55e",
  icon: "D",
  order: 0,
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
    projectId: project.id,
    tags: [],
    completed: false,
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-01-10T12:00:00.000Z",
    ...rest,
    id,
  };
}

test("renders project sections as horizontal board columns", () => {
  const sectionTask = makeTask({
    id: "task-1",
    name: "Wireframes",
    sectionId: section.id,
  });
  const unassignedTask = makeTask({
    id: "task-2",
    name: "Collect references",
  });
  const database: Database = {
    users: [],
    organizations: [],
    projects: [project],
    tasks: [sectionTask, unassignedTask],
    mailboxes: [],
    inboxItems: [],
    emailRules: [],
    summaryProfiles: [],
    ruleStats: { active: 0, quarantine: 0, alwaysDelete: 0 },
    quarantineCount: 0,
    tags: [],
    sections: [section],
    taskSections: [
      {
        id: "task-section-1",
        taskId: sectionTask.id,
        sectionId: section.id,
        createdAt: "2026-01-10T12:00:00.000Z",
      },
    ],
    userSectionPreferences: [],
    timeBlocks: [],
    timeBlockTasks: [],
    settings: { showCompletedTasks: true },
  };

  const html = renderToStaticMarkup(
    <ProjectSectionBoard
      sections={[section]}
      unassignedTasks={[unassignedTask]}
      visibleTasks={[sectionTask, unassignedTask]}
      database={database}
      projectId={project.id}
      bulkSelectMode={false}
      selectedTaskIds={new Set()}
      loadingTaskIds={new Set()}
      animatingOutTaskIds={new Set()}
      optimisticCompletedIds={new Set()}
      sectionTasksBySectionId={new Map([[section.id, [sectionTask]]])}
      childSectionsByParentId={new Map()}
      autoSectioning={false}
      onTaskFocus={() => {}}
      onTaskToggle={() => {}}
      onTaskEdit={() => {}}
      onTaskDelete={() => {}}
      onTaskSelect={() => {}}
      onSectionEdit={() => {}}
      onSectionDelete={() => {}}
      onAddTask={() => {}}
      onAddSection={() => {}}
      onTaskDropToSection={() => {}}
      onTaskDropToUnassigned={() => {}}
      onAutoOrganizeUnassigned={() => {}}
    />,
  );

  assert.match(html, /Design/);
  assert.match(html, /Wireframes/);
  assert.match(html, /Unassigned/);
  assert.match(html, /Collect references/);
  assert.match(html, /Add Section/);
});

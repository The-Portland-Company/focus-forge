/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectWorkTabs } from "../project-work-tabs";

test("renders task and email tabs with the active task panel", () => {
  const html = renderToStaticMarkup(
    <ProjectWorkTabs
      activeTab="tasks"
      emailCount={2}
      taskCount={5}
      onTabChange={() => undefined}
      taskContent={<div>Project Task Filters</div>}
      emailContent={<div>Email Work Rows</div>}
    />,
  );

  assert.match(html, /Tasks/);
  assert.match(html, /Email Work/);
  assert.match(html, /Project Task Filters/);
  assert.doesNotMatch(html, /Email Work Rows/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /project-work-panel-tasks/);
});

test("renders the email panel when the email tab is active", () => {
  const html = renderToStaticMarkup(
    <ProjectWorkTabs
      activeTab="emails"
      emailCount={0}
      taskCount={3}
      onTabChange={() => undefined}
      taskContent={<div>Project Task Filters</div>}
      emailContent={<div>No email work linked to this project.</div>}
    />,
  );

  assert.match(html, /Tasks/);
  assert.match(html, /Email Work/);
  assert.match(html, /No email work linked to this project\./);
  assert.doesNotMatch(html, /Project Task Filters/);
  assert.match(html, /project-work-panel-emails/);
});

/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchableSelectRows } from "@/components/ui/searchable-select";

const PROJECTS = [
  { value: "1", label: "Focus: Forge Web" },
  { value: "2", label: "NuEra Heat" },
  { value: "3", label: "Politogy VRM" },
];

test("an empty query lists every option under the clear row", () => {
  const rows = buildSearchableSelectRows(PROJECTS, "", "No project");
  assert.deepEqual(
    rows.map((row) => row.label),
    ["No project", "Focus: Forge Web", "NuEra Heat", "Politogy VRM"],
  );
});

test("typing filters the options and ignores case", () => {
  const rows = buildSearchableSelectRows(PROJECTS, "nuera", "No project");
  assert.deepEqual(
    rows.map((row) => row.label),
    ["No project", "NuEra Heat"],
  );
});

test("a query matches anywhere in the label, not just the start", () => {
  const rows = buildSearchableSelectRows(PROJECTS, "vrm", "No project");
  assert.deepEqual(
    rows.map((row) => row.label),
    ["No project", "Politogy VRM"],
  );
});

test("whitespace-only input is treated as no query", () => {
  const rows = buildSearchableSelectRows(PROJECTS, "   ", "No project");
  assert.equal(rows.length, PROJECTS.length + 1);
});

test("the clear row survives a query that matches nothing", () => {
  const rows = buildSearchableSelectRows(PROJECTS, "zzzz", "No project");
  assert.deepEqual(
    rows.map((row) => row.label),
    ["No project"],
  );
  assert.equal(rows[0].value, "");
});

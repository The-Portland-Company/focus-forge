/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  getBulkSelectionState,
  setBulkSelectionForTaskIds,
} from "../project-bulk-selection";

test("setBulkSelectionForTaskIds adds all visible tasks without dropping existing unrelated selections", () => {
  const currentSelection = new Set(["task-0", "task-9"]);

  const nextSelection = setBulkSelectionForTaskIds(
    currentSelection,
    ["task-1", "task-2", "task-3"],
    true,
  );

  assert.deepEqual([...nextSelection].sort(), [
    "task-0",
    "task-1",
    "task-2",
    "task-3",
    "task-9",
  ]);
});

test("setBulkSelectionForTaskIds removes only the supplied visible tasks", () => {
  const currentSelection = new Set(["task-1", "task-2", "task-3", "task-9"]);

  const nextSelection = setBulkSelectionForTaskIds(
    currentSelection,
    ["task-1", "task-3"],
    false,
  );

  assert.deepEqual([...nextSelection].sort(), ["task-2", "task-9"]);
});

test("getBulkSelectionState reports visible selection counts accurately", () => {
  const state = getBulkSelectionState(
    ["task-1", "task-2", "task-3"],
    new Set(["task-2", "task-3", "task-9"]),
  );

  assert.equal(state.visibleSelectedCount, 2);
  assert.equal(state.hasVisibleSelection, true);
  assert.equal(state.allVisibleSelected, false);
});

test("getBulkSelectionState marks all visible tasks as selected only when the full visible set is selected", () => {
  const state = getBulkSelectionState(
    ["task-1", "task-2"],
    new Set(["task-1", "task-2", "task-9"]),
  );

  assert.equal(state.visibleSelectedCount, 2);
  assert.equal(state.hasVisibleSelection, true);
  assert.equal(state.allVisibleSelected, true);
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sumTimeEstimate,
  sumCost,
  formatDuration,
  taskTimeEstimate,
  buildProjectRollups,
} from "../rollup";

describe("taskTimeEstimate", () => {
  test("reads either casing and coerces strings", () => {
    assert.equal(taskTimeEstimate({ time_estimate: 30 }), 30);
    assert.equal(taskTimeEstimate({ timeEstimate: "45" }), 45);
  });
  test("treats missing / non-positive as zero", () => {
    assert.equal(taskTimeEstimate({}), 0);
    assert.equal(taskTimeEstimate({ time_estimate: null }), 0);
    assert.equal(taskTimeEstimate({ time_estimate: -5 }), 0);
  });
});

describe("sumTimeEstimate", () => {
  test("sums estimates, excluding completed items", () => {
    const items = [
      { time_estimate: 60 },
      { time_estimate: 30, completed: true }, // excluded
      { timeEstimate: 15 },
    ];
    assert.equal(sumTimeEstimate(items), 75);
  });
  test("an empty list is zero", () => {
    assert.equal(sumTimeEstimate([]), 0);
  });
});

describe("sumCost", () => {
  test("mirrors supplyTotal, excluding completed supplies", () => {
    const items = [
      { is_supply: true, supply_price: 10, supply_quantity: 2 }, // 20
      { is_supply: true, supply_price: 5, completed: true }, // excluded
      { is_supply: false, time_estimate: 99 } as never,
    ];
    assert.equal(sumCost(items), 20);
  });
});

describe("formatDuration", () => {
  test("formats hours and minutes", () => {
    assert.equal(formatDuration(200), "3h 20m");
    assert.equal(formatDuration(120), "2h");
    assert.equal(formatDuration(45), "45m");
  });
  test("empty for zero", () => {
    assert.equal(formatDuration(0), "");
  });
});

describe("buildProjectRollups", () => {
  test("sums tasks across descendant projects and counts direct children", () => {
    const projects = [
      { id: "vrm", parentId: null },
      { id: "mode-campaign", parentId: "vrm" },
      { id: "spec-a", parentId: "mode-campaign" },
      { id: "spec-b", parentId: "mode-campaign" },
    ];
    const tasks = [
      { project_id: "spec-a", completed: true },
      { project_id: "spec-a", completed: false },
      { project_id: "spec-b", completed: false },
    ];
    const rollups = buildProjectRollups(projects, tasks);

    assert.equal(rollups.get("spec-a")?.taskCount, 2);
    assert.equal(rollups.get("spec-a")?.completedTaskCount, 1);
    assert.equal(rollups.get("spec-b")?.taskCount, 1);

    const modeRollup = rollups.get("mode-campaign");
    assert.equal(modeRollup?.childProjectCount, 2);
    assert.equal(modeRollup?.taskCount, 3);
    assert.equal(modeRollup?.completedTaskCount, 1);

    const vrmRollup = rollups.get("vrm");
    assert.equal(vrmRollup?.childProjectCount, 1);
    assert.equal(vrmRollup?.taskCount, 3);
  });

  test("a project with no tasks of its own still rolls up descendants", () => {
    const projects = [
      { id: "parent", parentId: null },
      { id: "child", parentId: "parent" },
    ];
    const tasks = [{ project_id: "child", completed: false }];
    const rollups = buildProjectRollups(projects, tasks);
    assert.equal(rollups.get("parent")?.taskCount, 1);
    assert.equal(rollups.get("parent")?.progress, 0);
  });

  test("does not infinite-loop on a cyclic parent_id", () => {
    const projects = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    const rollups = buildProjectRollups(projects, []);
    assert.ok(rollups.get("a"));
    assert.ok(rollups.get("b"));
  });
});

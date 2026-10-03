import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sumTimeEstimate,
  sumCost,
  formatDuration,
  taskTimeEstimate,
  buildProjectRollups,
  rollupProjects,
  rollupProgressPercent,
  projectAncestors,
  projectChildren,
  projectIdsIncludingChildren,
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

describe("rollupProjects", () => {
  test("sums own tasks plus descendants, recursively, up a 3-level tree", () => {
    const projects = [
      { id: "root", parent_id: null },
      { id: "child", parent_id: "root" },
      { id: "grandchild", parent_id: "child" },
    ];
    const tasksByProject = new Map([
      ["root", [{ time_estimate: 10 }]],
      ["child", [{ time_estimate: 20 }, { time_estimate: 5, completed: true }]],
      ["grandchild", [{ time_estimate: 30 }]],
    ]);
    const result = rollupProjects(projects, tasksByProject);
    assert.equal(result.get("grandchild")!.totalTimeEstimate, 30);
    assert.equal(result.get("child")!.totalTimeEstimate, 50); // 20 + 30
    assert.equal(result.get("root")!.totalTimeEstimate, 60); // 10 + 20 + 30
    assert.equal(result.get("root")!.ownTimeEstimate, 10);
    assert.equal(result.get("child")!.taskCount, 3); // 2 own + 1 grandchild
    assert.equal(result.get("child")!.completedTaskCount, 1);
  });

  test("a project with no tasks and no children rolls up to zero", () => {
    const result = rollupProjects([{ id: "solo" }], new Map());
    assert.equal(result.get("solo")!.totalTimeEstimate, 0);
    assert.equal(result.get("solo")!.taskCount, 0);
  });

  test("an orphaned parent reference (parent not in set) is treated as top-level", () => {
    const projects = [{ id: "a", parent_id: "missing-parent" }];
    const result = rollupProjects(projects, new Map([["a", [{ time_estimate: 5 }]]]));
    assert.equal(result.get("a")!.totalTimeEstimate, 5);
  });

  test("a cycle in the data does not infinite-loop and still returns a finite rollup", () => {
    const projects = [
      { id: "x", parent_id: "y" },
      { id: "y", parent_id: "x" },
    ];
    const tasksByProject = new Map([
      ["x", [{ time_estimate: 10 }]],
      ["y", [{ time_estimate: 20 }]],
    ]);
    const result = rollupProjects(projects, tasksByProject);
    // Each node's own total includes itself; the cycle is broken rather than
    // looping forever, so totals are finite (not necessarily symmetric).
    assert.ok(Number.isFinite(result.get("x")!.totalTimeEstimate));
    assert.ok(Number.isFinite(result.get("y")!.totalTimeEstimate));
  });
});

describe("rollupProgressPercent", () => {
  test("rounds completed/total to a percent", () => {
    assert.equal(
      rollupProgressPercent({
        projectId: "p",
        ownTimeEstimate: 0,
        ownCost: 0,
        totalTimeEstimate: 0,
        totalCost: 0,
        taskCount: 3,
        completedTaskCount: 1,
      }),
      33,
    );
  });
  test("zero tasks is 0%, not NaN", () => {
    assert.equal(
      rollupProgressPercent({
        projectId: "p",
        ownTimeEstimate: 0,
        ownCost: 0,
        totalTimeEstimate: 0,
        totalCost: 0,
        taskCount: 0,
        completedTaskCount: 0,
      }),
      0,
    );
  });
});

describe("projectAncestors", () => {
  const tree = [
    { id: "root", parent_id: null },
    { id: "mid", parent_id: "root" },
    { id: "leaf", parent_id: "mid" },
  ];

  test("returns the chain root-first, excluding the project itself", () => {
    assert.deepEqual(
      projectAncestors("leaf", tree).map((p) => p.id),
      ["root", "mid"],
    );
  });

  test("a top-level project has an empty chain", () => {
    assert.deepEqual(projectAncestors("root", tree), []);
  });

  test("a cycle terminates instead of looping forever", () => {
    const cyclic = [
      { id: "a", parent_id: "b" },
      { id: "b", parent_id: "a" },
    ];
    const chain = projectAncestors("a", cyclic);
    assert.ok(Number.isFinite(chain.length));
  });
});

describe("projectChildren", () => {
  test("direct children only, ordered", () => {
    const projects = [
      { id: "root", parent_id: null, order: 0 },
      { id: "b", parent_id: "root", order: 2 },
      { id: "a", parent_id: "root", order: 1 },
      { id: "grandchild", parent_id: "b", order: 0 },
    ];
    assert.deepEqual(
      projectChildren("root", projects).map((p) => p.id),
      ["a", "b"],
    );
  });
});

describe("projectIdsIncludingChildren", () => {
  const tree = [
    { id: "root", parent_id: null },
    { id: "mid", parent_id: "root" },
    { id: "leaf", parent_id: "mid" },
    { id: "sibling", parent_id: "root" },
    { id: "other", parent_id: null },
  ];

  test("includes the project and every descendant, not siblings", () => {
    const ids = projectIdsIncludingChildren("root", tree);
    assert.deepEqual(
      [...ids].sort(),
      ["leaf", "mid", "root", "sibling"].sort(),
    );
    assert.ok(!ids.has("other"));
  });

  test("a leaf with no children is just itself", () => {
    assert.deepEqual([...projectIdsIncludingChildren("leaf", tree)], ["leaf"]);
  });

  test("a cycle terminates instead of looping forever", () => {
    const cyclic = [
      { id: "a", parent_id: "b" },
      { id: "b", parent_id: "a" },
    ];
    const ids = projectIdsIncludingChildren("a", cyclic);
    assert.deepEqual([...ids].sort(), ["a", "b"]);
  });
});

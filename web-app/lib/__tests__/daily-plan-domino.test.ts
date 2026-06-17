/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  attachDominoAndSort,
  type DominoGraphData,
  type DominoAttachableTask,
} from "../daily-plan/domino";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-17T12:00:00Z");

function task(id: string): DominoAttachableTask {
  return { id, name: `Task ${id}`, dueDate: "2026-06-18" };
}

// eliminates-recurring: $40/week laundromat eliminated forever (recurring).
// defuses-once: a near-trigger $300 consequence defused once.
function buildGraph(): DominoGraphData {
  return {
    stakes: [
      {
        id: "s-elim",
        kind: "consequence",
        name: "Laundromat cost",
        monetary_value: 40,
        recurrence: "weekly",
        recurrence_interval_days: 7,
        status: "active",
        trigger_at: new Date(NOW.getTime() + 30 * DAY).toISOString(),
      },
      {
        id: "s-defuse",
        kind: "consequence",
        name: "Late fee",
        monetary_value: 300,
        status: "active",
        trigger_at: new Date(NOW.getTime() + 1 * DAY).toISOString(), // near trigger
      },
    ],
    edges: [],
    links: [
      {
        task_id: "elim-task",
        stake_id: "s-elim",
        resolution_type: "eliminates",
      },
      {
        task_id: "defuse-task",
        stake_id: "s-defuse",
        resolution_type: "defuses_once",
      },
    ],
    taskEffortMinutes: {
      "elim-task": 120,
      "defuse-task": 60,
    },
  };
}

test("staked tasks outrank an unstaked task and are sorted by score", () => {
  const tasks = [task("unstaked"), task("defuse-task"), task("elim-task")];
  const result = attachDominoAndSort(tasks, buildGraph(), NOW);

  const ids = result.map((t) => t.id);
  // Unstaked task must sort last.
  assert.equal(ids[ids.length - 1], "unstaked");
  // Both staked tasks must outrank the unstaked one.
  assert.ok(ids.indexOf("elim-task") < ids.indexOf("unstaked"));
  assert.ok(ids.indexOf("defuse-task") < ids.indexOf("unstaked"));

  const unstaked = result.find((t) => t.id === "unstaked")!;
  assert.equal(unstaked.domino, undefined);
});

test("domino object is shaped correctly", () => {
  const result = attachDominoAndSort(
    [task("elim-task"), task("defuse-task")],
    buildGraph(),
    NOW,
  );

  const elim = result.find((t) => t.id === "elim-task")!;
  assert.ok(elim.domino, "elim task has a domino object");
  assert.ok(elim.domino!.score > 0);
  assert.equal(typeof elim.domino!.topStakeSummary, "string");
  assert.ok(elim.domino!.nearestTriggerAt);
  assert.equal(elim.domino!.stakes.length, 1);
  assert.deepEqual(
    {
      name: elim.domino!.stakes[0].name,
      kind: elim.domino!.stakes[0].kind,
      dollarEquivalent: elim.domino!.stakes[0].dollarEquivalent,
      resolution: elim.domino!.stakes[0].resolution,
    },
    {
      name: "Laundromat cost",
      kind: "consequence",
      dollarEquivalent: 40,
      resolution: "eliminates",
    },
  );

  const defuse = result.find((t) => t.id === "defuse-task")!;
  assert.equal(defuse.domino!.stakes[0].resolution, "defuses_once");
  assert.equal(defuse.domino!.stakes[0].dollarEquivalent, 300);
});

test("zero stakes leaves tasks untouched and in original order", () => {
  const tasks = [task("a"), task("b"), task("c")];
  const empty: DominoGraphData = {
    stakes: [],
    edges: [],
    links: [],
    taskEffortMinutes: {},
  };
  const result = attachDominoAndSort(tasks, empty, NOW);
  assert.deepEqual(
    result.map((t) => t.id),
    ["a", "b", "c"],
  );
  assert.ok(result.every((t) => t.domino === undefined));
});

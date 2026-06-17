/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  baseWeight,
  buildGraph,
  effectiveWeight,
  urgencyMultiplier,
  resolutionMultiplier,
  computeTaskDominoScores,
  type Stake,
  type StakeEdge,
  type TaskStakeLink,
} from "../domino/scoring";
import {
  SEVERITY_DOLLARS,
  HOP_DISCOUNT,
  ELIMINATE_HORIZON_WEEKS,
} from "../domino/constants";

const DAY = 24 * 60 * 60 * 1000;

function stake(partial: Partial<Stake> & { id: string }): Stake {
  return { kind: "consequence", status: "active", ...partial };
}

// ---------------------------------------------------------------------------
// baseWeight: severity vs monetary
// ---------------------------------------------------------------------------
test("baseWeight uses monetary_value when present", () => {
  assert.equal(baseWeight(stake({ id: "a", monetary_value: 250 })), 250);
});

test("baseWeight takes absolute value of monetary_value", () => {
  assert.equal(baseWeight(stake({ id: "a", monetary_value: -250 })), 250);
});

test("baseWeight falls back to severity dollar-equivalent", () => {
  assert.equal(
    baseWeight(stake({ id: "a", severity: "severe" })),
    SEVERITY_DOLLARS.severe,
  );
  assert.equal(
    baseWeight(stake({ id: "a", severity: "critical" })),
    SEVERITY_DOLLARS.critical,
  );
});

test("baseWeight prefers monetary over severity", () => {
  assert.equal(
    baseWeight(stake({ id: "a", monetary_value: 50, severity: "critical" })),
    50,
  );
});

test("baseWeight is 0 with neither monetary nor severity", () => {
  assert.equal(baseWeight(stake({ id: "a" })), 0);
});

// ---------------------------------------------------------------------------
// effectiveWeight: 3-deep chain discount
// ---------------------------------------------------------------------------
test("3-deep chain applies 0.7^hop discount", () => {
  const stakes = [
    stake({ id: "a", monetary_value: 100 }),
    stake({ id: "b", monetary_value: 100 }),
    stake({ id: "c", monetary_value: 100 }),
  ];
  const edges: StakeEdge[] = [
    { parent_stake_id: "a", child_stake_id: "b" },
    { parent_stake_id: "b", child_stake_id: "c" },
  ];
  const graph = buildGraph(stakes, edges);
  // own 100 + 0.7*100 + 0.7*(0.7*100) = 100 + 70 + 49 = 219
  const expected = 100 + HOP_DISCOUNT * 100 + HOP_DISCOUNT * HOP_DISCOUNT * 100;
  assert.equal(effectiveWeight("a", graph), expected);
  assert.equal(expected, 219);
});

test("effectiveWeight of a leaf is just its base weight", () => {
  const stakes = [stake({ id: "c", monetary_value: 100 })];
  const graph = buildGraph(stakes, []);
  assert.equal(effectiveWeight("c", graph), 100);
});

// ---------------------------------------------------------------------------
// Cycle safety
// ---------------------------------------------------------------------------
test("effectiveWeight terminates on a cycle", () => {
  const stakes = [
    stake({ id: "a", monetary_value: 100 }),
    stake({ id: "b", monetary_value: 100 }),
  ];
  const edges: StakeEdge[] = [
    { parent_stake_id: "a", child_stake_id: "b" },
    { parent_stake_id: "b", child_stake_id: "a" }, // cycle (DB rejects, lib must survive)
  ];
  const graph = buildGraph(stakes, edges);
  // a: 100 + 0.7 * (b without revisiting a) = 100 + 0.7 * 100 = 170
  assert.equal(effectiveWeight("a", graph), 170);
});

// ---------------------------------------------------------------------------
// Urgency boundaries
// ---------------------------------------------------------------------------
test("urgency is 1 when trigger is far away", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const far = new Date(now.getTime() + 60 * DAY).toISOString();
  assert.equal(urgencyMultiplier(far, now), 1);
});

test("urgency is 1 exactly at the ramp edge (14 days out)", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const edge = new Date(now.getTime() + 14 * DAY).toISOString();
  assert.equal(urgencyMultiplier(edge, now), 1);
});

test("urgency is max (3) at trigger time", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  assert.equal(urgencyMultiplier(now.toISOString(), now), 3);
});

test("urgency is max (3) past trigger time", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const past = new Date(now.getTime() - 5 * DAY).toISOString();
  assert.equal(urgencyMultiplier(past, now), 3);
});

test("urgency ramps to ~2 at the halfway point (7 days out)", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const half = new Date(now.getTime() + 7 * DAY).toISOString();
  assert.equal(urgencyMultiplier(half, now), 2);
});

test("urgency is 1 with no trigger_at", () => {
  assert.equal(urgencyMultiplier(null, new Date()), 1);
});

// ---------------------------------------------------------------------------
// Resolution multiplier + eliminates horizon math
// ---------------------------------------------------------------------------
test("defuses_once resolution multiplier is 1", () => {
  const s = stake({ id: "a", monetary_value: 40, recurrence_interval_days: 7 });
  const link: TaskStakeLink = {
    task_id: "t",
    stake_id: "a",
    resolution_type: "defuses_once",
  };
  assert.equal(resolutionMultiplier(s, link), 1);
});

test("eliminates of a weekly stake spans the 52-week horizon", () => {
  const s = stake({ id: "a", monetary_value: 40, recurrence_interval_days: 7 });
  const link: TaskStakeLink = {
    task_id: "t",
    stake_id: "a",
    resolution_type: "eliminates",
  };
  const cycles = resolutionMultiplier(s, link);
  // floor(52*7 / 7) = 52
  assert.equal(cycles, Math.floor((ELIMINATE_HORIZON_WEEKS * 7) / 7));
  assert.equal(cycles, 52);
  // $40/wk eliminated → $40 * 52 = $2,080 discounted value
  assert.equal(baseWeight(s) * cycles, 2080);
});

test("eliminates of a non-recurring stake collapses to 1", () => {
  const s = stake({ id: "a", monetary_value: 40 });
  const link: TaskStakeLink = {
    task_id: "t",
    stake_id: "a",
    resolution_type: "eliminates",
  };
  assert.equal(resolutionMultiplier(s, link), 1);
});

// ---------------------------------------------------------------------------
// computeTaskDominoScores + effort floor
// ---------------------------------------------------------------------------
test("effort floor caps tiny efforts at 0.25h", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const stakes = [stake({ id: "s", monetary_value: 100 })]; // no trigger → urgency 1
  const links: TaskStakeLink[] = [
    { task_id: "t", stake_id: "s", resolution_type: "defuses_once" },
  ];
  const [res] = computeTaskDominoScores(
    { stakes, edges: [], links, taskEffortMinutes: { t: 1 } }, // 1 min → floored to 0.25h
    now,
  );
  // 100 / 0.25 = 400
  assert.equal(res.score, 400);
});

test("computeTaskDominoScores divides by real effort hours above the floor", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const stakes = [stake({ id: "s", monetary_value: 100 })];
  const links: TaskStakeLink[] = [
    { task_id: "t", stake_id: "s", resolution_type: "defuses_once" },
  ];
  const [res] = computeTaskDominoScores(
    { stakes, edges: [], links, taskEffortMinutes: { t: 120 } }, // 2h
    now,
  );
  assert.equal(res.score, 50); // 100 / 2
});

test("computeTaskDominoScores reports topStakeId and nearestTriggerAt", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const soon = new Date(now.getTime() + 2 * DAY).toISOString();
  const later = new Date(now.getTime() + 40 * DAY).toISOString();
  const stakes = [
    stake({ id: "small", monetary_value: 10, trigger_at: later }),
    stake({ id: "big", monetary_value: 500, trigger_at: soon }),
  ];
  const links: TaskStakeLink[] = [
    { task_id: "t", stake_id: "small", resolution_type: "defuses_once" },
    { task_id: "t", stake_id: "big", resolution_type: "defuses_once" },
  ];
  const [res] = computeTaskDominoScores(
    { stakes, edges: [], links, taskEffortMinutes: { t: 60 } },
    now,
  );
  assert.equal(res.topStakeId, "big");
  assert.equal(res.nearestTriggerAt, soon);
  assert.equal(res.contributions.length, 2);
});

test("inactive stakes are skipped in task scoring", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const stakes = [
    stake({ id: "done", monetary_value: 999, status: "defused" }),
  ];
  const links: TaskStakeLink[] = [
    { task_id: "t", stake_id: "done", resolution_type: "defuses_once" },
  ];
  const [res] = computeTaskDominoScores(
    { stakes, edges: [], links, taskEffortMinutes: { t: 60 } },
    now,
  );
  assert.equal(res.score, 0);
  assert.equal(res.contributions.length, 0);
});

test("consequence contributions carry a negative signedValue for display", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const stakes = [
    stake({ id: "c", kind: "consequence", monetary_value: 100 }),
    stake({ id: "r", kind: "reward", monetary_value: 100 }),
  ];
  const links: TaskStakeLink[] = [
    { task_id: "t", stake_id: "c", resolution_type: "defuses_once" },
    { task_id: "t", stake_id: "r", resolution_type: "defuses_once" },
  ];
  const [res] = computeTaskDominoScores(
    { stakes, edges: [], links, taskEffortMinutes: { t: 60 } },
    now,
  );
  const cContrib = res.contributions.find((x) => x.stakeId === "c");
  const rContrib = res.contributions.find((x) => x.stakeId === "r");
  assert.equal(cContrib?.signedValue, -100);
  assert.equal(rContrib?.signedValue, 100);
  // Both still add positively to the score.
  assert.equal(res.score, 200);
});

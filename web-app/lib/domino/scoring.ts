// Domino Effect — deterministic scoring lib (Phase 2).
// Pure functions only: no I/O, no clock reads except via injected `now`.
// See web-app/docs/domino-effect-stakes-plan.md.

import {
  SEVERITY_DOLLARS,
  HOP_DISCOUNT,
  ELIMINATE_HORIZON_WEEKS,
  URGENCY,
  type Severity,
} from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StakeKind = "consequence" | "reward";
export type StakeStatus = "active" | "defused" | "eliminated" | "expired";
export type ResolutionType = "defuses_once" | "eliminates";

export interface Stake {
  id: string;
  kind: StakeKind;
  name?: string;
  /** Stored positive; the dollar magnitude of the consequence/reward. */
  monetary_value?: number | null;
  /** Used when monetary_value is absent. */
  severity?: Severity | null;
  /** ISO-8601 timestamp when the domino falls (drives urgency). */
  trigger_at?: string | null;
  recurrence?: string | null;
  recurrence_interval_days?: number | null;
  status?: StakeStatus | null;
}

export interface StakeEdge {
  parent_stake_id: string;
  child_stake_id: string;
  /** Per-edge override of HOP_DISCOUNT; defaults to HOP_DISCOUNT when absent. */
  weight_multiplier?: number | null;
}

export interface TaskStakeLink {
  task_id: string;
  stake_id: string;
  resolution_type: ResolutionType;
}

/** Graph view consumed by effectiveWeight. */
export interface StakeGraph {
  /** Stake lookup by id. */
  stakes: Map<string, Stake>;
  /** Adjacency: parent id → outgoing edges. */
  childrenByParent: Map<string, StakeEdge[]>;
}

export interface DominoContribution {
  stakeId: string;
  /** Effective weight (own + discounted downstream), pre-multipliers. */
  effectiveWeight: number;
  urgency: number;
  resolutionMultiplier: number;
  /** Signed for display: rewards positive, consequences negative magnitude. */
  signedValue: number;
  /** This contribution's positive add to the score (already ÷ effortHours). */
  scoreContribution: number;
  triggerAt: string | null;
}

export interface TaskDominoScore {
  taskId: string;
  score: number;
  contributions: DominoContribution[];
  topStakeId: string | null;
  nearestTriggerAt: string | null;
}

export interface ComputeInput {
  stakes: Stake[];
  edges: StakeEdge[];
  links: TaskStakeLink[];
  /** task_id → effort in minutes. Missing/invalid falls back to the floor. */
  taskEffortMinutes: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Base weight
// ---------------------------------------------------------------------------

/** Monetary value if present, else the severity dollar-equivalent, else 0. */
export function baseWeight(stake: Stake): number {
  if (
    typeof stake.monetary_value === "number" &&
    Number.isFinite(stake.monetary_value)
  ) {
    return Math.abs(stake.monetary_value);
  }
  if (stake.severity && stake.severity in SEVERITY_DOLLARS) {
    return SEVERITY_DOLLARS[stake.severity];
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Graph building + effective weight
// ---------------------------------------------------------------------------

export function buildGraph(stakes: Stake[], edges: StakeEdge[]): StakeGraph {
  const stakeMap = new Map<string, Stake>();
  for (const s of stakes) stakeMap.set(s.id, s);

  const childrenByParent = new Map<string, StakeEdge[]>();
  for (const e of edges) {
    if (!stakeMap.has(e.parent_stake_id) || !stakeMap.has(e.child_stake_id)) {
      continue; // skip dangling edges
    }
    const list = childrenByParent.get(e.parent_stake_id) ?? [];
    list.push(e);
    childrenByParent.set(e.parent_stake_id, list);
  }
  return { stakes: stakeMap, childrenByParent };
}

/**
 * Effective weight of a stake: its own base weight plus the discounted
 * weight of every downstream stake reachable through edges. DFS with a
 * visited-set cycle guard and per-root memoization.
 */
export function effectiveWeight(stakeId: string, graph: StakeGraph): number {
  const memo = new Map<string, number>();

  function dfs(id: string, visited: Set<string>): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;

    const stake = graph.stakes.get(id);
    if (!stake) return 0;

    let total = baseWeight(stake);
    visited.add(id);

    const edges = graph.childrenByParent.get(id) ?? [];
    for (const edge of edges) {
      const childId = edge.child_stake_id;
      if (visited.has(childId)) continue; // cycle guard
      const mult =
        typeof edge.weight_multiplier === "number" &&
        Number.isFinite(edge.weight_multiplier)
          ? edge.weight_multiplier
          : HOP_DISCOUNT;
      total += mult * dfs(childId, visited);
    }

    visited.delete(id);
    // Memoize only paths free of an active cycle context; safe because the
    // discount product is path-independent for acyclic reachability.
    memo.set(id, total);
    return total;
  }

  return dfs(stakeId, new Set<string>());
}

// ---------------------------------------------------------------------------
// Urgency
// ---------------------------------------------------------------------------

/**
 * Urgency multiplier ramps linearly from 1 (far away) to maxMultiplier
 * (at or past trigger_at) over the final rampDays. Null/invalid trigger = 1.
 */
export function urgencyMultiplier(
  triggerAt: string | null | undefined,
  now: Date,
): number {
  if (!triggerAt) return 1;
  const triggerMs = new Date(triggerAt).getTime();
  if (!Number.isFinite(triggerMs)) return 1;

  const nowMs = now.getTime();
  const rampMs = URGENCY.rampDays * 24 * 60 * 60 * 1000;
  const msUntil = triggerMs - nowMs;

  if (msUntil <= 0) return URGENCY.maxMultiplier; // at or past trigger
  if (msUntil >= rampMs) return 1; // outside the ramp window

  const progress = 1 - msUntil / rampMs; // 0 → 1 across the ramp
  return 1 + progress * (URGENCY.maxMultiplier - 1);
}

// ---------------------------------------------------------------------------
// Resolution multiplier
// ---------------------------------------------------------------------------

/**
 * defuses_once = 1×. eliminates = recurrence-aware horizon multiple:
 * number of recurrence cycles that fit in ELIMINATE_HORIZON_WEEKS, floored at 1.
 * Non-recurring eliminates collapse to 1×.
 */
export function resolutionMultiplier(stake: Stake, link: TaskStakeLink): number {
  if (link.resolution_type !== "eliminates") return 1;

  const intervalDays = stake.recurrence_interval_days;
  if (
    typeof intervalDays === "number" &&
    Number.isFinite(intervalDays) &&
    intervalDays > 0
  ) {
    const horizonDays = ELIMINATE_HORIZON_WEEKS * 7;
    const cycles = Math.floor(horizonDays / intervalDays);
    return Math.max(1, cycles);
  }

  return 1; // non-recurring: eliminating once == defusing once
}

// ---------------------------------------------------------------------------
// Per-task scoring
// ---------------------------------------------------------------------------

const EFFORT_FLOOR_HOURS = 0.25;

function earlierTrigger(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

/**
 * Compute per-task domino scores.
 * score = Σ (effectiveWeight × urgency × resolutionMult) ÷ effortHours,
 * with an effort floor of 0.25h. Rewards and avoided consequences both add
 * positive value; signed contribution is retained for display.
 */
export function computeTaskDominoScores(
  input: ComputeInput,
  now: Date = new Date(),
): TaskDominoScore[] {
  const graph = buildGraph(input.stakes, input.edges);

  const linksByTask = new Map<string, TaskStakeLink[]>();
  for (const link of input.links) {
    const list = linksByTask.get(link.task_id) ?? [];
    list.push(link);
    linksByTask.set(link.task_id, list);
  }

  const results: TaskDominoScore[] = [];

  for (const [taskId, links] of linksByTask) {
    const minutes = input.taskEffortMinutes[taskId];
    const rawHours =
      typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
        ? minutes / 60
        : 0;
    const effortHours = Math.max(EFFORT_FLOOR_HOURS, rawHours);

    const contributions: DominoContribution[] = [];
    let score = 0;
    let topStakeId: string | null = null;
    let topContribution = -Infinity;
    let nearestTriggerAt: string | null = null;

    for (const link of links) {
      const stake = graph.stakes.get(link.stake_id);
      if (!stake) continue;
      if (stake.status && stake.status !== "active") continue;

      const ew = effectiveWeight(stake.id, graph);
      const urgency = urgencyMultiplier(stake.trigger_at, now);
      const resMult = resolutionMultiplier(stake, link);

      const weighted = ew * urgency * resMult;
      const scoreContribution = weighted / effortHours;
      score += scoreContribution;

      const sign = stake.kind === "consequence" ? -1 : 1;

      contributions.push({
        stakeId: stake.id,
        effectiveWeight: ew,
        urgency,
        resolutionMultiplier: resMult,
        signedValue: sign * ew,
        scoreContribution,
        triggerAt: stake.trigger_at ?? null,
      });

      if (scoreContribution > topContribution) {
        topContribution = scoreContribution;
        topStakeId = stake.id;
      }
      nearestTriggerAt = earlierTrigger(
        nearestTriggerAt,
        stake.trigger_at ?? null,
      );
    }

    results.push({
      taskId,
      score,
      contributions,
      topStakeId,
      nearestTriggerAt,
    });
  }

  return results;
}

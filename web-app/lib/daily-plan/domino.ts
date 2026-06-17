// Domino Effect — Daily Planner integration (Phase 4).
// Pure helpers: attach compact domino summaries to plan tasks and pre-sort
// them by domino score so the AI sees a deterministically-anchored order
// BEFORE it applies capacity/deadline judgment.
//
// See web-app/docs/domino-effect-stakes-plan.md (Phase 4).

import {
  baseWeight,
  computeTaskDominoScores,
  type Stake,
  type StakeEdge,
  type TaskStakeLink,
  type TaskDominoScore,
} from "@/lib/domino/scoring";
import type { DominoStakeSummary, DominoTaskSummary } from "./types";

/** Graph data as returned by adapter.getDominoGraphData(organizationId). */
export interface DominoGraphData {
  stakes: Stake[];
  edges: StakeEdge[];
  links: TaskStakeLink[];
  taskEffortMinutes: Record<string, number>;
}

/** Minimal shape a plan task must satisfy for ordering/attachment. */
export interface DominoAttachableTask {
  id: string;
  dueDate?: string | null;
  [key: string]: unknown;
}

export type WithDomino<T> = T & { domino?: DominoTaskSummary };

function buildStakeSummaries(
  links: TaskStakeLink[],
  stakeById: Map<string, Stake>,
): DominoStakeSummary[] {
  const summaries: DominoStakeSummary[] = [];
  for (const link of links) {
    const stake = stakeById.get(link.stake_id);
    if (!stake) continue;
    if (stake.status && stake.status !== "active") continue;
    summaries.push({
      name: stake.name ?? null,
      kind: stake.kind,
      dollarEquivalent: baseWeight(stake),
      triggerAt: stake.trigger_at ?? null,
      resolution: link.resolution_type,
    });
  }
  return summaries;
}

function summarizeTopStake(
  topStakeId: string | null,
  stakeById: Map<string, Stake>,
): string | null {
  if (!topStakeId) return null;
  const stake = stakeById.get(topStakeId);
  if (!stake) return null;
  const dollars = baseWeight(stake);
  const name = stake.name ?? "Unnamed stake";
  const label = stake.kind === "reward" ? "reward" : "consequence";
  return dollars > 0
    ? `${name} (${label}, ~$${Math.round(dollars)})`
    : `${name} (${label})`;
}

/**
 * Attach a compact `domino` object to each task that has active stakes, then
 * pre-sort the tasks: highest domino score first. Tasks with no stakes (no
 * domino object / score 0) sort last among themselves while preserving the
 * incoming order (which already encodes the existing due-date tie-break).
 *
 * Pure: no I/O, deterministic given `now`. Backward compatible — with zero
 * stakes/links every task is returned untouched in its original order.
 */
export function attachDominoAndSort<T extends DominoAttachableTask>(
  tasks: T[],
  graph: DominoGraphData | null | undefined,
  now: Date = new Date(),
): WithDomino<T>[] {
  if (!graph || !graph.links || graph.links.length === 0) {
    return tasks.map((t) => ({ ...t }) as WithDomino<T>);
  }

  const stakeById = new Map<string, Stake>();
  for (const s of graph.stakes || []) stakeById.set(s.id, s);

  const scores = computeTaskDominoScores(
    {
      stakes: graph.stakes || [],
      edges: graph.edges || [],
      links: graph.links || [],
      taskEffortMinutes: graph.taskEffortMinutes || {},
    },
    now,
  );
  const scoreByTask = new Map<string, TaskDominoScore>();
  for (const s of scores) scoreByTask.set(s.taskId, s);

  const linksByTask = new Map<string, TaskStakeLink[]>();
  for (const link of graph.links) {
    const list = linksByTask.get(link.task_id) ?? [];
    list.push(link);
    linksByTask.set(link.task_id, list);
  }

  // Preserve original ordering for the stable tie-break.
  const originalIndex = new Map<string, number>();
  tasks.forEach((t, i) => originalIndex.set(t.id, i));

  const enriched: WithDomino<T>[] = tasks.map((task) => {
    const score = scoreByTask.get(task.id);
    const links = linksByTask.get(task.id) ?? [];
    const stakeSummaries = buildStakeSummaries(links, stakeById);

    // No active stakes → no domino object (sorts last among themselves).
    if (!score || stakeSummaries.length === 0 || score.score <= 0) {
      return { ...task } as WithDomino<T>;
    }

    const domino: DominoTaskSummary = {
      score: score.score,
      topStakeSummary: summarizeTopStake(score.topStakeId, stakeById),
      nearestTriggerAt: score.nearestTriggerAt,
      stakes: stakeSummaries,
    };
    return { ...task, domino } as WithDomino<T>;
  });

  enriched.sort((a, b) => {
    const sa = a.domino?.score ?? 0;
    const sb = b.domino?.score ?? 0;
    if (sb !== sa) return sb - sa; // higher score first
    // Tie-break: preserve incoming order (existing due-date ordering).
    return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
  });

  return enriched;
}

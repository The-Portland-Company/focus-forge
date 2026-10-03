/**
 * Running subtotals for a task subtree, task list, or section: how much time
 * and money the outstanding work still represents.
 *
 * Time is summed from each task's estimate (minutes). Cost reuses lib/supply so
 * a rollup can never disagree with the supply totals shown elsewhere. Both
 * exclude completed items — a subtotal is "what's still left", matching how the
 * supply total already treats acquired supplies.
 *
 * Accepts both the camelCase Task shape and raw snake_case rows, like SupplyLike.
 */

import { supplyTotal, type SupplyLike } from "./supply";

export interface TimeLike {
  completed?: boolean | null;
  time_estimate?: number | string | null;
  timeEstimate?: number | string | null;
}

function toMinutes(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** This item's own time estimate in minutes (0 when unset). */
export function taskTimeEstimate(item: TimeLike): number {
  return toMinutes(item.time_estimate ?? item.timeEstimate);
}

/**
 * Sum of time estimates across the items, in minutes. Completed items are
 * excluded so the subtotal reflects remaining effort.
 */
export function sumTimeEstimate(items: TimeLike[]): number {
  return items.reduce<number>(
    (sum, item) => (item.completed ? sum : sum + taskTimeEstimate(item)),
    0,
  );
}

/** Outstanding supply cost across the items (completed supplies excluded). */
export function sumCost(items: SupplyLike[]): number {
  return supplyTotal(items);
}

/**
 * Format a minute count as "3h 20m" / "2h" / "45m". Returns "" for 0 so callers
 * can drop the time chip entirely when there's nothing to show.
 */
export function formatDuration(minutes: number): string {
  const mins = Math.max(0, Math.round(minutes));
  if (mins === 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export interface ProjectRollupLike {
  id: string;
  parentId?: string | null;
  parent_id?: string | null;
}

export interface ProjectTaskCountLike {
  project_id?: string | null;
  projectId?: string | null;
  completed?: boolean | null;
}

export interface ProjectRollup {
  childProjectCount: number;
  taskCount: number;
  completedTaskCount: number;
  progress: number;
}

/**
 * Cross-project roll-up for a sub-project tree (Mode → spec → section, in the
 * Specs⇄Forge mapping): task/completion counts summed over a project and
 * every descendant project, plus how many direct children it has.
 *
 * `tasks` need only carry project_id/projectId + completed; counts for a
 * project with no tasks of its own still include its descendants'.
 */
export function buildProjectRollups(
  projects: ProjectRollupLike[],
  tasks: ProjectTaskCountLike[],
): Map<string, ProjectRollup> {
  const childrenByParent = new Map<string, string[]>();
  for (const project of projects) {
    const parentId = project.parentId ?? project.parent_id ?? null;
    if (!parentId) continue;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(project.id);
    childrenByParent.set(parentId, siblings);
  }

  const ownTaskCounts = new Map<string, { total: number; completed: number }>();
  for (const task of tasks) {
    const projectId = task.projectId ?? task.project_id ?? null;
    if (!projectId) continue;
    const entry = ownTaskCounts.get(projectId) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (task.completed) entry.completed += 1;
    ownTaskCounts.set(projectId, entry);
  }

  const memo = new Map<string, ProjectRollup>();

  function resolve(projectId: string, seen: Set<string>): ProjectRollup {
    const cached = memo.get(projectId);
    if (cached) return cached;
    if (seen.has(projectId)) {
      // Cyclic parent_id data — stop rather than recurse forever.
      return { childProjectCount: 0, taskCount: 0, completedTaskCount: 0, progress: 0 };
    }
    seen.add(projectId);

    const own = ownTaskCounts.get(projectId) ?? { total: 0, completed: 0 };
    const children = childrenByParent.get(projectId) ?? [];

    let taskCount = own.total;
    let completedTaskCount = own.completed;
    for (const childId of children) {
      const childRollup = resolve(childId, seen);
      taskCount += childRollup.taskCount;
      completedTaskCount += childRollup.completedTaskCount;
    }

    const rollup: ProjectRollup = {
      childProjectCount: children.length,
      taskCount,
      completedTaskCount,
      progress: taskCount > 0 ? completedTaskCount / taskCount : 0,
    };
    memo.set(projectId, rollup);
    return rollup;
  }

  for (const project of projects) {
    resolve(project.id, new Set());
  }

  return memo;
}

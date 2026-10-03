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

/**
 * Project hierarchy roll-up: given every project in an org (flat, each with
 * its own id/parentId) plus the tasks that belong to them, compute, for each
 * project, the outstanding time/cost summed across that project AND every
 * descendant sub-project (recursive). Pure/in-memory so it works the same
 * whether the caller pre-loaded rows or called the `project_rollup` RPC.
 *
 * Cycles (which the DB trigger should prevent, but a stale cache could still
 * contain) are broken defensively: a project is never visited twice while
 * walking down, so a cycle just stops contributing further rather than
 * looping forever.
 */
export interface ProjectLike {
  id: string;
  parent_id?: string | null;
  parentId?: string | null;
}

export interface SubtreeRollup {
  projectId: string;
  /** This project's own direct tasks, excluding descendants. */
  ownTimeEstimate: number;
  ownCost: number;
  /** This project plus every descendant sub-project, recursively. */
  totalTimeEstimate: number;
  totalCost: number;
  taskCount: number;
  completedTaskCount: number;
}

function projectParentId(p: ProjectLike): string | null {
  return p.parent_id ?? p.parentId ?? null;
}

/**
 * Builds a roll-up per project. `tasksByProject` maps a project id to the
 * tasks directly in that project (not pre-aggregated across children).
 */
export function rollupProjects(
  projects: ProjectLike[],
  tasksByProject: Map<string, Array<TimeLike & SupplyLike>>,
): Map<string, SubtreeRollup> {
  const childrenByParent = new Map<string | null, ProjectLike[]>();
  for (const project of projects) {
    const parentId = projectParentId(project);
    const key = projects.some((p) => p.id === parentId) ? parentId : null;
    const bucket = childrenByParent.get(key) ?? [];
    bucket.push(project);
    childrenByParent.set(key, bucket);
  }

  const results = new Map<string, SubtreeRollup>();

  // Post-order so a parent's total is computed after all its children.
  const visit = (project: ProjectLike, ancestors: Set<string>): SubtreeRollup => {
    const cached = results.get(project.id);
    if (cached) return cached;

    const ownTasks = tasksByProject.get(project.id) ?? [];
    const ownTimeEstimate = sumTimeEstimate(ownTasks);
    const ownCost = sumCost(ownTasks);
    const taskCount = ownTasks.length;
    const completedTaskCount = ownTasks.filter((t) => t.completed).length;

    let totalTimeEstimate = ownTimeEstimate;
    let totalCost = ownCost;
    let totalTaskCount = taskCount;
    let totalCompleted = completedTaskCount;

    if (!ancestors.has(project.id)) {
      const nextAncestors = new Set(ancestors).add(project.id);
      for (const child of childrenByParent.get(project.id) ?? []) {
        const childRollup = visit(child, nextAncestors);
        totalTimeEstimate += childRollup.totalTimeEstimate;
        totalCost += childRollup.totalCost;
        totalTaskCount += childRollup.taskCount;
        totalCompleted += childRollup.completedTaskCount;
      }
    }

    const rollup: SubtreeRollup = {
      projectId: project.id,
      ownTimeEstimate,
      ownCost,
      totalTimeEstimate,
      totalCost,
      taskCount: totalTaskCount,
      completedTaskCount: totalCompleted,
    };
    results.set(project.id, rollup);
    return rollup;
  };

  for (const project of projects) {
    visit(project, new Set());
  }

  return results;
}

/** Progress percent (0-100) for a roll-up, based on completed vs total tasks. */
export function rollupProgressPercent(rollup: SubtreeRollup): number {
  if (rollup.taskCount === 0) return 0;
  return Math.round((rollup.completedTaskCount / rollup.taskCount) * 100);
}

/**
 * Ancestor chain for a project, root-first, for rendering breadcrumbs
 * ("Org / Grandparent / Parent"). Excludes the project itself. Stops at the
 * first revisited id, so a cycle in stale data can't loop forever.
 */
export function projectAncestors<T extends ProjectLike>(
  projectId: string,
  projects: T[],
): T[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const chain: T[] = [];
  const seen = new Set<string>([projectId]);
  let current = byId.get(projectId);
  while (current) {
    const parentId = projectParentId(current);
    if (!parentId || seen.has(parentId)) break;
    const parent = byId.get(parentId);
    if (!parent) break;
    chain.unshift(parent);
    seen.add(parentId);
    current = parent;
  }
  return chain;
}

/** Direct child projects of `projectId` (not recursive), in `order`. */
export function projectChildren<T extends ProjectLike & { order?: number }>(
  projectId: string,
  projects: T[],
): T[] {
  return projects
    .filter((p) => projectParentId(p) === projectId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * `projectId` plus every descendant sub-project id, recursive — the set a
 * "this project, including children" filter should match against. Defensive
 * against cycles the same way `rollupProjects` is: a project is never
 * expanded twice.
 */
export function projectIdsIncludingChildren(
  projectId: string,
  projects: ProjectLike[],
): Set<string> {
  const childrenByParent = new Map<string, ProjectLike[]>();
  for (const project of projects) {
    const parentId = projectParentId(project);
    if (parentId === null) continue;
    const bucket = childrenByParent.get(parentId) ?? [];
    bucket.push(project);
    childrenByParent.set(parentId, bucket);
  }

  const result = new Set<string>();
  const stack = [projectId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of childrenByParent.get(id) ?? []) {
      if (!result.has(child.id)) stack.push(child.id);
    }
  }
  return result;
}

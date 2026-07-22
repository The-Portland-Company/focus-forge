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

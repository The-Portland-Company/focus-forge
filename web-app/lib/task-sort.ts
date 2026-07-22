/**
 * Scheduled-first task ordering.
 *
 * Project pages order sibling tasks so that any task with BOTH a due date and a
 * due time ("scheduled") sorts first, chronologically by its combined
 * date+time. Every other task ("unscheduled" — including tasks that have a date
 * but no time) keeps its existing relative order after the scheduled ones.
 *
 * This layers on top of whatever fallback comparator a caller already uses
 * (e.g. the manual drag order / priority order in the task list): the fallback
 * only decides ordering between two unscheduled tasks.
 */

/** Minimal shape needed to read a task's due date/time in camel or snake case. */
export interface SchedulableTask {
  dueDate?: string | null;
  due_date?: string | null;
  dueTime?: string | null;
  due_time?: string | null;
}

/** Read the due date off a task, tolerating camel or snake case. */
export function getDueDate(task: SchedulableTask): string | null {
  const value =
    (task as { due_date?: string | null }).due_date ?? task.dueDate ?? null;
  return value ? value : null;
}

/** Read the due time off a task, tolerating camel or snake case. */
export function getDueTime(task: SchedulableTask): string | null {
  const value =
    (task as { due_time?: string | null }).due_time ?? task.dueTime ?? null;
  return value ? value : null;
}

/**
 * Combined date+time timestamp (epoch ms) for a "scheduled" task, or null when
 * the task is missing a date, missing a time, or the combination isn't a valid
 * date. A task with a date but no time is intentionally treated as unscheduled.
 */
export function getScheduledTimestamp(task: SchedulableTask): number | null {
  const date = getDueDate(task);
  const time = getDueTime(task);
  if (!date || !time) return null;

  // due_date may already carry a time component (ISO). Prefer the explicit
  // date portion combined with the explicit due time.
  const datePart = date.includes("T") ? date.slice(0, date.indexOf("T")) : date;
  const timestamp = new Date(`${datePart}T${time}`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/** True when a task has both a due date and a due time. */
export function isScheduled(task: SchedulableTask): boolean {
  return getScheduledTimestamp(task) !== null;
}

/**
 * Comparator that puts scheduled tasks (date + time) first in chronological
 * order and defers to `fallback` for every other pairing. Scheduled tasks
 * always precede unscheduled ones; two unscheduled tasks use `fallback` so
 * their existing relative order is preserved (with a stable sort).
 */
export function compareScheduledFirst<T extends SchedulableTask>(
  a: T,
  b: T,
  fallback: (a: T, b: T) => number = () => 0,
): number {
  const aTs = getScheduledTimestamp(a);
  const bTs = getScheduledTimestamp(b);

  if (aTs !== null && bTs !== null) {
    if (aTs !== bTs) return aTs - bTs;
    return fallback(a, b);
  }
  if (aTs !== null) return -1;
  if (bTs !== null) return 1;
  return fallback(a, b);
}

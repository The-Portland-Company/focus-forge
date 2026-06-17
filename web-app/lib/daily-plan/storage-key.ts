/**
 * Build the per-day localStorage key used to cache the generated daily plan.
 *
 * Keying on the local calendar date means a generated plan rehydrates when the
 * user navigates away and back on the SAME day (so we never re-run the AI), but
 * a new day produces a new key — surfacing the "Generate plan" button again
 * rather than auto-running.
 *
 * @param date The reference date (defaults to now). Local date components are
 *   used so the key matches the user's wall-clock day.
 */
export function dailyPlanStorageKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `dailyPlan:${year}-${month}-${day}`;
}

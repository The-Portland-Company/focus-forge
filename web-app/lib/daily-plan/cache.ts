/**
 * Server-side Daily Plan cache helpers.
 *
 * The Daily Plan is cached per (user, plan_date) in public.daily_plan_cache so
 * a user on multiple devices doesn't re-run the AI planner on each device. An
 * explicit Replan sends `force` (or `replan`) to bypass the cache and overwrite
 * the cached row.
 */

/** Coerce a request body's force/replan flag into a strict boolean. */
export function isForceReplan(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as { force?: unknown; replan?: unknown };
  return b.force === true || b.replan === true;
}

/**
 * Decide whether the cached plan should be used (returned directly, skipping
 * the AI planner). True only when the caller did NOT force a replan AND a
 * cached row exists.
 */
export function shouldUseCache(force: boolean, hasCachedPlan: boolean): boolean {
  return !force && hasCachedPlan;
}

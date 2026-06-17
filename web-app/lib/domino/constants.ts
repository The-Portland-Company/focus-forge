// Domino Effect — deterministic scoring constants (Phase 2).
// See web-app/docs/domino-effect-stakes-plan.md.

/** Dollar-equivalents for non-monetary severity tiers. */
export const SEVERITY_DOLLARS = {
  minor: 25,
  moderate: 100,
  severe: 400,
  critical: 1500,
} as const;

/** Per-hop discount applied to downstream (child) stake weights in a chain. */
export const HOP_DISCOUNT = 0.7;

/** Horizon (weeks) over which an "eliminates" resolver accrues recurring value. */
export const ELIMINATE_HORIZON_WEEKS = 52;

/** Urgency ramp: multiplier grows from 1 → maxMultiplier over the final rampDays. */
export const URGENCY = {
  maxMultiplier: 3,
  rampDays: 14,
} as const;

export type Severity = keyof typeof SEVERITY_DOLLARS;

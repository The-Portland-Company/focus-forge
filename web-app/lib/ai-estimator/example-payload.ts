/**
 * Pure validation/normalization helpers for the HITL `task_estimate_examples`
 * payload (the AI estimator training set). Extracted from the API route so they
 * can be unit-tested in isolation. No I/O — safe to import anywhere.
 */

/**
 * Clamp accepted minutes to the table's 1–480 CHECK range. Null if missing or
 * non-numeric (null/undefined/"" are treated as missing, NOT silently coerced
 * to 1) so callers can distinguish "no value" from a real number.
 */
export function clampMinutes(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(480, Math.max(1, Math.round(num)));
}

/** Coerce arbitrary input into a clean, deduped-by-trim tag list (max 16). */
export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0)
    .slice(0, 16);
}

/** Normalize an optional free-text field: trim, empty -> null. */
export function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalize an optional integer priority: blank/invalid -> null. */
export function normalizePriority(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export interface ValidatedExample {
  taskName: string;
  taskDescription: string | null;
  projectName: string | null;
  tags: string[];
  priority: number | null;
  acceptedMinutes: number;
}

/**
 * Validate a POST (manual add) payload. Returns either a typed `value` ready to
 * persist or an `error` string suitable for a 400 response. Pure.
 */
export function validateExamplePayload(
  body: unknown,
): { value: ValidatedExample } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "invalid body" };
  }
  const b = body as Record<string, unknown>;

  const taskName = typeof b.taskName === "string" ? b.taskName.trim() : "";
  if (!taskName) {
    return { error: "taskName required" };
  }

  const acceptedMinutes = clampMinutes(b.acceptedMinutes);
  if (acceptedMinutes == null) {
    return { error: "acceptedMinutes must be a number 1–480" };
  }

  return {
    value: {
      taskName,
      taskDescription: normalizeOptionalText(b.taskDescription),
      projectName: normalizeOptionalText(b.projectName),
      tags: normalizeTags(b.tags),
      priority: normalizePriority(b.priority),
      acceptedMinutes,
    },
  };
}

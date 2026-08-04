"use client";

/**
 * "Hide empty task lists" — a per-user view preference plus per-section
 * overrides, both kept in localStorage (this is view state, not shared data).
 *
 * Empty task lists are hidden by default: a project accumulates lists that have
 * been cleared out, and they crowd the ones with work in them. A list can be
 * pinned back into view individually — that override lasts until the list next
 * becomes empty again, which is what `forgetOverridesForFilledSections` does
 * once a list has picked up tasks.
 */

const HIDE_EMPTY_KEY = "focus-forge.sections.hide-empty";
const VISIBLE_OVERRIDES_KEY = "focus-forge.sections.visible-overrides";

function userKey(base: string, userId: string) {
  return `${base}:${userId}`;
}

export function loadHideEmptySections(
  userId: string | null | undefined,
): boolean {
  if (!userId || typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(userKey(HIDE_EMPTY_KEY, userId));
    // Default ON: absent preference means hide.
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export function saveHideEmptySections(
  userId: string | null | undefined,
  hide: boolean,
) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(userKey(HIDE_EMPTY_KEY, userId), String(hide));
  } catch {
    // ignore quota / privacy-mode failures
  }
}

export function loadVisibleSectionOverrides(
  userId: string | null | undefined,
): string[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(
      userKey(VISIBLE_OVERRIDES_KEY, userId),
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveVisibleSectionOverrides(
  userId: string | null | undefined,
  sectionIds: string[],
) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      userKey(VISIBLE_OVERRIDES_KEY, userId),
      JSON.stringify(Array.from(new Set(sectionIds))),
    );
  } catch {
    // ignore
  }
}

/**
 * Drop overrides for lists that now hold tasks. They no longer need pinning,
 * and clearing them is what makes the override expire "until the next time it
 * is empty" rather than sticking forever.
 */
export function forgetOverridesForFilledSections(
  overrides: string[],
  isEmpty: (sectionId: string) => boolean,
): string[] {
  return overrides.filter((sectionId) => isEmpty(sectionId));
}

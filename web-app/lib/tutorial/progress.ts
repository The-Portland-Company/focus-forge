// Pure reducers over TutorialProgress. Kept side-effect free so the mutation
// logic is unit-testable without React or Supabase. The hook (hooks.ts) wires
// these to the shared user_preferences store.

import { getChapterProgress, type TutorialProgress } from "./types";

export function applySectionFlag(
  progress: TutorialProgress,
  chapterSlug: string,
  sectionSlug: string,
  flag: "reviewed" | "completed",
  value: boolean,
  now: string,
): TutorialProgress {
  const chap = getChapterProgress(progress, chapterSlug);
  const sections = { ...(chap.sections ?? {}) };
  sections[sectionSlug] = {
    ...sections[sectionSlug],
    [flag]: value,
    viewedAt: sections[sectionSlug]?.viewedAt ?? now,
  };
  return { ...progress, [chapterSlug]: { ...chap, sections } };
}

export function applyChapterComplete(
  progress: TutorialProgress,
  chapterSlug: string,
  value: boolean,
): TutorialProgress {
  const chap = getChapterProgress(progress, chapterSlug);
  return { ...progress, [chapterSlug]: { ...chap, completed: value } };
}

export function applyBookmark(
  progress: TutorialProgress,
  chapterSlug: string,
  sectionSlug: string | null,
): TutorialProgress {
  const chap = getChapterProgress(progress, chapterSlug);
  return {
    ...progress,
    [chapterSlug]: { ...chap, bookmarkedSectionSlug: sectionSlug },
  };
}

export function applyRecordViewed(
  progress: TutorialProgress,
  chapterSlug: string,
  sectionSlug: string,
  now: string,
): TutorialProgress {
  const chap = getChapterProgress(progress, chapterSlug);
  const sections = { ...(chap.sections ?? {}) };
  if (!sections[sectionSlug]?.viewedAt) {
    sections[sectionSlug] = { ...sections[sectionSlug], viewedAt: now };
  }
  return {
    ...progress,
    [chapterSlug]: { ...chap, sections },
    lastVisited: { chapter: chapterSlug, section: sectionSlug },
  };
}

export function applyDismissTooltip(
  progress: TutorialProgress,
  anchorKey: string,
): TutorialProgress {
  const dismissed = progress.dismissedTooltips ?? [];
  if (dismissed.includes(anchorKey)) return progress;
  return { ...progress, dismissedTooltips: [...dismissed, anchorKey] };
}

/** True when every section of the chapter is marked completed. */
export function isChapterFullyComplete(
  progress: TutorialProgress,
  chapterSlug: string,
  sectionSlugs: string[],
): boolean {
  const chap = getChapterProgress(progress, chapterSlug);
  return sectionSlugs.every((s) => chap.sections?.[s]?.completed);
}

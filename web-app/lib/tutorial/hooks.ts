"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUserPreferences } from "@/lib/supabase/hooks";
import { fetchChapters, fetchTooltips } from "./queries";
import {
  getChapterProgress,
  type ChapterProgress,
  type TutorialChapter,
  type TutorialProgress,
  type TutorialTooltip,
} from "./types";
import {
  applyBookmark,
  applyChapterComplete,
  applyDismissTooltip,
  applyRecordViewed,
  applySectionFlag,
} from "./progress";

/** Loads published chapters (with sections) once per mount. */
export function useTutorialChapters() {
  const [chapters, setChapters] = useState<TutorialChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    fetchChapters()
      .then((c) => alive && setChapters(c))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { chapters, loading, error };
}

/** Loads published contextual tooltips once per mount. */
export function useTutorialTooltips() {
  const [tooltips, setTooltips] = useState<TutorialTooltip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchTooltips()
      .then((t) => alive && setTooltips(t))
      .catch(() => alive && setTooltips([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { tooltips, loading };
}

/**
 * Read + mutate the current user's tutorial progress, which lives inside
 * `user_preferences.tutorial_progress`. All mutators optimistically update the
 * shared preferences store (via updatePreferences) then persist.
 */
export function useTutorialProgress() {
  const { preferences, loading, updatePreferences } = useUserPreferences();

  const progress: TutorialProgress = useMemo(
    () => (preferences?.tutorial_progress as TutorialProgress) ?? {},
    [preferences],
  );

  const persist = useCallback(
    (next: TutorialProgress) =>
      updatePreferences({ tutorial_progress: next }),
    [updatePreferences],
  );

  const chapterProgress = useCallback(
    (chapterSlug: string): ChapterProgress =>
      getChapterProgress(progress, chapterSlug),
    [progress],
  );

  const setSectionFlag = useCallback(
    (
      chapterSlug: string,
      sectionSlug: string,
      flag: "reviewed" | "completed",
      value: boolean,
    ) =>
      persist(
        applySectionFlag(
          progress,
          chapterSlug,
          sectionSlug,
          flag,
          value,
          new Date().toISOString(),
        ),
      ),
    [progress, persist],
  );

  const markReviewed = useCallback(
    (c: string, s: string, v = true) => setSectionFlag(c, s, "reviewed", v),
    [setSectionFlag],
  );

  const markSectionComplete = useCallback(
    (c: string, s: string, v = true) => setSectionFlag(c, s, "completed", v),
    [setSectionFlag],
  );

  const markChapterComplete = useCallback(
    (chapterSlug: string, v = true) =>
      persist(applyChapterComplete(progress, chapterSlug, v)),
    [progress, persist],
  );

  const setBookmark = useCallback(
    (chapterSlug: string, sectionSlug: string | null) =>
      persist(applyBookmark(progress, chapterSlug, sectionSlug)),
    [progress, persist],
  );

  const setLastVisited = useCallback(
    (chapter: string, section: string) =>
      persist({ ...progress, lastVisited: { chapter, section } }),
    [progress, persist],
  );

  const recordViewed = useCallback(
    (chapterSlug: string, sectionSlug: string) =>
      persist(
        applyRecordViewed(
          progress,
          chapterSlug,
          sectionSlug,
          new Date().toISOString(),
        ),
      ),
    [progress, persist],
  );

  const tipsEnabled = progress.tipsEnabled !== false; // default on
  const setTipsEnabled = useCallback(
    (v: boolean) => persist({ ...progress, tipsEnabled: v }),
    [progress, persist],
  );

  const dismissedTooltips = useMemo(
    () => progress.dismissedTooltips ?? [],
    [progress],
  );
  const dismissTooltip = useCallback(
    (anchorKey: string) => {
      if (dismissedTooltips.includes(anchorKey)) return Promise.resolve();
      return persist(applyDismissTooltip(progress, anchorKey));
    },
    [progress, persist, dismissedTooltips],
  );

  return {
    progress,
    loading,
    chapterProgress,
    markReviewed,
    markSectionComplete,
    markChapterComplete,
    setBookmark,
    setLastVisited,
    recordViewed,
    tipsEnabled,
    setTipsEnabled,
    dismissedTooltips,
    dismissTooltip,
  };
}

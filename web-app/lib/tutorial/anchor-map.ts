"use client";

import { useCallback, useMemo } from "react";
import { useTutorialChapters } from "./hooks";

/**
 * Returns a resolver that maps a tutorial section id to its reader URL
 * (`/tutorial/<chapterSlug>/<sectionSlug>`), or null when unknown. Used by the
 * coach-mark layer's "Learn more" deep link.
 */
export function useTutorialSectionSlug() {
  const { chapters } = useTutorialChapters();

  const byId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of chapters) {
      for (const s of c.sections) {
        map.set(s.id, `/tutorial/${c.slug}/${s.slug}`);
      }
    }
    return map;
  }, [chapters]);

  return useCallback(
    (sectionId: string | null): string | null =>
      (sectionId && byId.get(sectionId)) || null,
    [byId],
  );
}

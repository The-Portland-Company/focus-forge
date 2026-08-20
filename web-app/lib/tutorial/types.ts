// Types for the interactive tutorial system.

export type TutorialTopic = "core" | "nuance";
export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TutorialSection {
  id: string;
  chapter_id: string;
  slug: string;
  title: string;
  /** Rich content. `{ markdown: string }` for now; shape is intentionally open. */
  body: { markdown?: string } & Record<string, unknown>;
  video_path: string | null;
  estimated_minutes: number | null;
  order_index: number;
}

export interface TutorialChapter {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  icon: string | null;
  topic: TutorialTopic;
  order_index: number;
  published: boolean;
  sections: TutorialSection[];
}

export interface TutorialTooltip {
  id: string;
  section_id: string | null;
  anchor_key: string;
  title: string;
  body: string;
  placement: TooltipPlacement;
  order_index: number;
}

// ---- Per-user progress (stored in user_preferences.tutorial_progress) ----

export interface SectionProgress {
  reviewed?: boolean;
  completed?: boolean;
  viewedAt?: string;
}

export interface ChapterProgress {
  completed?: boolean;
  bookmarkedSectionSlug?: string | null;
  sections?: Record<string, SectionProgress>;
}

export interface TutorialProgress {
  /** keyed by chapter slug */
  [chapterSlug: string]: unknown;
  lastVisited?: { chapter: string; section: string } | null;
  tipsEnabled?: boolean;
  dismissedTooltips?: string[];
}

/** Narrowed accessor: chapter entries live alongside the reserved keys above. */
export function getChapterProgress(
  progress: TutorialProgress | null | undefined,
  chapterSlug: string,
): ChapterProgress {
  const entry = progress?.[chapterSlug];
  if (entry && typeof entry === "object") return entry as ChapterProgress;
  return {};
}

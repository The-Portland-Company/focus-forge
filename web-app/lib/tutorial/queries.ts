// Client-side data access for tutorial content. RLS already restricts reads to
// published rows (admins additionally see drafts), so these queries stay simple.

import { createClient } from "@/lib/supabase/client";
import type {
  TutorialChapter,
  TutorialSection,
  TutorialTooltip,
} from "./types";

// The tutorial_* tables ship ahead of a regenerated database.types.ts (types
// gen is privilege-gated on this project), so we cast the client to `any` for
// these reads — matching the repo's "cast until types regenerated" convention.
/** All published chapters with their sections, ordered for the reader. */
export async function fetchChapters(): Promise<TutorialChapter[]> {
  const supabase = createClient() as any;

  const [{ data: chapters, error: cErr }, { data: sections, error: sErr }] =
    await Promise.all([
      supabase
        .from("tutorial_chapters")
        .select("*")
        .order("order_index", { ascending: true }),
      supabase
        .from("tutorial_sections")
        .select("*")
        .order("order_index", { ascending: true }),
    ]);

  if (cErr) throw cErr;
  if (sErr) throw sErr;

  const byChapter = new Map<string, TutorialSection[]>();
  for (const s of (sections ?? []) as TutorialSection[]) {
    const list = byChapter.get(s.chapter_id) ?? [];
    list.push(s);
    byChapter.set(s.chapter_id, list);
  }

  return ((chapters ?? []) as Omit<TutorialChapter, "sections">[]).map((c) => ({
    ...c,
    sections: byChapter.get(c.id) ?? [],
  }));
}

/** Published contextual tooltips, ordered. */
export async function fetchTooltips(): Promise<TutorialTooltip[]> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from("tutorial_tooltips")
    .select("*")
    .order("order_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TutorialTooltip[];
}

/** A public URL for a tutorial video stored in the `tutorial-videos` bucket. */
export function tutorialVideoUrl(videoPath: string | null): string | null {
  if (!videoPath) return null;
  const supabase = createClient();
  const { data } = supabase.storage
    .from("tutorial-videos")
    .getPublicUrl(videoPath);
  return data.publicUrl ?? null;
}

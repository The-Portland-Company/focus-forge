// Client-side data access for tutorial content. Reads go through server
// routes (app/api/tutorial/*) rather than a direct Supabase client — the
// browser no longer holds a Supabase session under TPC Auth (see
// lib/auth/tpc-session.ts), so the tutorial_* tables' RLS (published rows to
// `authenticated`) can only be satisfied server-side via requireViewer().

import { createClient } from "@/lib/supabase/client";
import type { TutorialChapter, TutorialTooltip } from "./types";

/** All published chapters with their sections, ordered for the reader. */
export async function fetchChapters(): Promise<TutorialChapter[]> {
  const res = await fetch("/api/tutorial/chapters", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load tutorial chapters");
  const { chapters } = await res.json();
  return (chapters ?? []) as TutorialChapter[];
}

/** Published contextual tooltips, ordered. */
export async function fetchTooltips(): Promise<TutorialTooltip[]> {
  const res = await fetch("/api/tutorial/tooltips", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load tutorial tooltips");
  const { tooltips } = await res.json();
  return (tooltips ?? []) as TutorialTooltip[];
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

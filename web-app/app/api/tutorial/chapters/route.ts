import { NextResponse } from "next/server";
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";
import type { TutorialChapter, TutorialSection } from "@/lib/tutorial/types";

// GET /api/tutorial/chapters — replaces lib/tutorial/queries.ts#fetchChapters'
// former direct browser Supabase read. RLS on tutorial_chapters/tutorial_sections
// only exposes published rows to `authenticated`, which no longer exists in the
// browser under TPC Auth; this runs the same query server-side with the
// caller's RLS-scoped client from requireViewer().
export async function GET() {
  const result = await requireViewerOrUnauthorized();
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  const [{ data: chapters, error: cErr }, { data: sections, error: sErr }] =
    await Promise.all([
      (supabase as any)
        .from("tutorial_chapters")
        .select("*")
        .order("order_index", { ascending: true }),
      (supabase as any)
        .from("tutorial_sections")
        .select("*")
        .order("order_index", { ascending: true }),
    ]);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

  const byChapter = new Map<string, TutorialSection[]>();
  for (const s of (sections ?? []) as TutorialSection[]) {
    const list = byChapter.get(s.chapter_id) ?? [];
    list.push(s);
    byChapter.set(s.chapter_id, list);
  }

  const result_: TutorialChapter[] = ((chapters ?? []) as Omit<TutorialChapter, "sections">[]).map(
    (c) => ({ ...c, sections: byChapter.get(c.id) ?? [] }),
  );

  return NextResponse.json({ chapters: result_ });
}

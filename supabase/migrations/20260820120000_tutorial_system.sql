-- Interactive Tutorial System
--
-- DB-driven, admin-authored tutorial content plus per-user progress tracking.
--
--   * tutorial_chapters  -> ordered chapters, grouped by topic ('core' | 'nuance'),
--                           publishable so drafts stay hidden.
--   * tutorial_sections  -> ordered sections within a chapter; each carries rich
--                           body content and an optional Supabase Storage video key.
--   * tutorial_tooltips  -> contextual coach-marks anchored to live UI elements via
--                           a stable `anchor_key` matched to `data-tutorial-id`.
--   * user_preferences.tutorial_progress (jsonb) -> resumable per-user progress:
--         { "<chapterSlug>": { "completed": bool,
--                              "bookmarkedSectionSlug": string|null,
--                              "sections": { "<sectionSlug>": { "reviewed": bool,
--                                                               "completed": bool,
--                                                               "viewedAt": iso } } },
--           "lastVisited": { "chapter": slug, "section": slug },
--           "tipsEnabled": bool,
--           "dismissedTooltips": [ "<anchor_key>", ... ] }
--
-- Content tables are global: any authenticated user may read PUBLISHED rows;
-- writes are restricted to admins. Following the repo's route pattern, admin
-- authoring goes through server routes using the service-role client (which
-- bypasses RLS), so the write policies here are a defence-in-depth backstop
-- keyed on profiles.role via a SECURITY DEFINER helper (never a self-join).

BEGIN;

-- 0. Admin check helper -----------------------------------------------------
-- SECURITY DEFINER so RLS on `profiles` can't recurse into these policies.
CREATE OR REPLACE FUNCTION public.is_tutorial_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'super_admin')
  );
$$;

-- 1. Chapters ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutorial_chapters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  summary      text,
  icon         text,
  topic        text NOT NULL DEFAULT 'core',
  order_index  integer NOT NULL DEFAULT 0,
  published    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tutorial_chapters_topic_check CHECK (topic IN ('core', 'nuance'))
);

-- 2. Sections ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutorial_sections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id         uuid NOT NULL REFERENCES public.tutorial_chapters(id) ON DELETE CASCADE,
  slug               text NOT NULL,
  title              text NOT NULL,
  body               jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_path         text,
  estimated_minutes  integer,
  order_index        integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tutorial_sections_slug_uniq UNIQUE (chapter_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_tutorial_sections_chapter
  ON public.tutorial_sections (chapter_id, order_index);

-- 3. Contextual tooltips ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutorial_tooltips (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id   uuid REFERENCES public.tutorial_sections(id) ON DELETE SET NULL,
  anchor_key   text NOT NULL UNIQUE,
  title        text NOT NULL,
  body         text NOT NULL,
  placement    text NOT NULL DEFAULT 'bottom',
  order_index  integer NOT NULL DEFAULT 0,
  published    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tutorial_tooltips_placement_check
    CHECK (placement IN ('top', 'bottom', 'left', 'right'))
);

-- 4. Per-user progress ------------------------------------------------------
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS tutorial_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5. updated_at touch trigger ----------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_tutorial_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_tutorial_chapters ON public.tutorial_chapters;
CREATE TRIGGER trg_touch_tutorial_chapters
  BEFORE UPDATE ON public.tutorial_chapters
  FOR EACH ROW EXECUTE FUNCTION public.touch_tutorial_updated_at();

DROP TRIGGER IF EXISTS trg_touch_tutorial_sections ON public.tutorial_sections;
CREATE TRIGGER trg_touch_tutorial_sections
  BEFORE UPDATE ON public.tutorial_sections
  FOR EACH ROW EXECUTE FUNCTION public.touch_tutorial_updated_at();

DROP TRIGGER IF EXISTS trg_touch_tutorial_tooltips ON public.tutorial_tooltips;
CREATE TRIGGER trg_touch_tutorial_tooltips
  BEFORE UPDATE ON public.tutorial_tooltips
  FOR EACH ROW EXECUTE FUNCTION public.touch_tutorial_updated_at();

-- 6. RLS --------------------------------------------------------------------
ALTER TABLE public.tutorial_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutorial_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutorial_tooltips ENABLE ROW LEVEL SECURITY;

-- Chapters: read published (or anything, if admin); admins write.
DROP POLICY IF EXISTS "read published chapters" ON public.tutorial_chapters;
CREATE POLICY "read published chapters" ON public.tutorial_chapters
  FOR SELECT TO authenticated
  USING (published OR public.is_tutorial_admin());

DROP POLICY IF EXISTS "admins write chapters" ON public.tutorial_chapters;
CREATE POLICY "admins write chapters" ON public.tutorial_chapters
  FOR ALL TO authenticated
  USING (public.is_tutorial_admin())
  WITH CHECK (public.is_tutorial_admin());

-- Sections: readable when their chapter is published (or admin); admins write.
DROP POLICY IF EXISTS "read published sections" ON public.tutorial_sections;
CREATE POLICY "read published sections" ON public.tutorial_sections
  FOR SELECT TO authenticated
  USING (
    public.is_tutorial_admin()
    OR EXISTS (
      SELECT 1 FROM public.tutorial_chapters c
      WHERE c.id = tutorial_sections.chapter_id AND c.published
    )
  );

DROP POLICY IF EXISTS "admins write sections" ON public.tutorial_sections;
CREATE POLICY "admins write sections" ON public.tutorial_sections
  FOR ALL TO authenticated
  USING (public.is_tutorial_admin())
  WITH CHECK (public.is_tutorial_admin());

-- Tooltips: read published; admins write.
DROP POLICY IF EXISTS "read published tooltips" ON public.tutorial_tooltips;
CREATE POLICY "read published tooltips" ON public.tutorial_tooltips
  FOR SELECT TO authenticated
  USING (published OR public.is_tutorial_admin());

DROP POLICY IF EXISTS "admins write tooltips" ON public.tutorial_tooltips;
CREATE POLICY "admins write tooltips" ON public.tutorial_tooltips
  FOR ALL TO authenticated
  USING (public.is_tutorial_admin())
  WITH CHECK (public.is_tutorial_admin());

-- 7. Storage bucket for tutorial videos ------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('tutorial-videos', 'tutorial-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for the bucket; admin-only write/update/delete.
DROP POLICY IF EXISTS "tutorial videos public read" ON storage.objects;
CREATE POLICY "tutorial videos public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tutorial-videos');

DROP POLICY IF EXISTS "tutorial videos admin write" ON storage.objects;
CREATE POLICY "tutorial videos admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tutorial-videos' AND public.is_tutorial_admin());

DROP POLICY IF EXISTS "tutorial videos admin modify" ON storage.objects;
CREATE POLICY "tutorial videos admin modify" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tutorial-videos' AND public.is_tutorial_admin())
  WITH CHECK (bucket_id = 'tutorial-videos' AND public.is_tutorial_admin());

DROP POLICY IF EXISTS "tutorial videos admin delete" ON storage.objects;
CREATE POLICY "tutorial videos admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tutorial-videos' AND public.is_tutorial_admin());

COMMIT;

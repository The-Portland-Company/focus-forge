-- Supabase Advisor remediation for the tutorial system migration.
-- Clears the 6 findings introduced by 20260820120000 without baselining any:
--
--   1. security/function_search_path_mutable on touch_tutorial_updated_at
--      -> pin an empty search_path (only NEW.* and now() are referenced).
--   2/3. anon_/authenticated_security_definer_function_executable on
--      is_tutorial_admin() -> revoke EXECUTE from all client roles. The
--      function is used ONLY inside RLS policies; policy evaluation of a
--      SECURITY DEFINER function does not consult the caller's EXECUTE grant
--      (verified against the live DB: reads still filter correctly with
--      EXECUTE revoked from `authenticated`), so nothing breaks.
--   4/5/6. performance/multiple_permissive_policies on the three tutorial
--      tables -> the FOR ALL admin policies overlapped the SELECT read
--      policies. Split admin writes into INSERT/UPDATE/DELETE so no two
--      permissive policies share the SELECT command. Admin read of drafts is
--      already covered by the `... OR public.is_tutorial_admin()` read policy.

BEGIN;

-- 1. Pin search_path on the trigger function.
CREATE OR REPLACE FUNCTION public.touch_tutorial_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2/3. is_tutorial_admin is a policy-only helper; no client role needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.is_tutorial_admin() FROM public, anon, authenticated;

-- 4/5/6. Replace FOR ALL admin policies with command-specific ones so they no
-- longer overlap the SELECT read policies.
DROP POLICY IF EXISTS "admins write chapters" ON public.tutorial_chapters;
CREATE POLICY "admins insert chapters" ON public.tutorial_chapters
  FOR INSERT TO authenticated WITH CHECK (public.is_tutorial_admin());
CREATE POLICY "admins update chapters" ON public.tutorial_chapters
  FOR UPDATE TO authenticated USING (public.is_tutorial_admin()) WITH CHECK (public.is_tutorial_admin());
CREATE POLICY "admins delete chapters" ON public.tutorial_chapters
  FOR DELETE TO authenticated USING (public.is_tutorial_admin());

DROP POLICY IF EXISTS "admins write sections" ON public.tutorial_sections;
CREATE POLICY "admins insert sections" ON public.tutorial_sections
  FOR INSERT TO authenticated WITH CHECK (public.is_tutorial_admin());
CREATE POLICY "admins update sections" ON public.tutorial_sections
  FOR UPDATE TO authenticated USING (public.is_tutorial_admin()) WITH CHECK (public.is_tutorial_admin());
CREATE POLICY "admins delete sections" ON public.tutorial_sections
  FOR DELETE TO authenticated USING (public.is_tutorial_admin());

DROP POLICY IF EXISTS "admins write tooltips" ON public.tutorial_tooltips;
CREATE POLICY "admins insert tooltips" ON public.tutorial_tooltips
  FOR INSERT TO authenticated WITH CHECK (public.is_tutorial_admin());
CREATE POLICY "admins update tooltips" ON public.tutorial_tooltips
  FOR UPDATE TO authenticated USING (public.is_tutorial_admin()) WITH CHECK (public.is_tutorial_admin());
CREATE POLICY "admins delete tooltips" ON public.tutorial_tooltips
  FOR DELETE TO authenticated USING (public.is_tutorial_admin());

COMMIT;

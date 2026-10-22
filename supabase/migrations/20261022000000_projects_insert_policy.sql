-- Fix: non-global-admin org members could not create projects.
--
-- The "Admins can manage projects in their organizations" policy on
-- public.projects is FOR ALL with only a USING clause (global
-- profiles.role IN ('admin','super_admin') OR is_super_admin()) and no
-- WITH CHECK. Postgres applies USING as the INSERT WITH CHECK, so INSERT
-- was gated to global admins only — the normal "New Project" flow (and
-- POST /api/projects) returned 500 ("Failed to create project", an RLS
-- denial surfaced as a PostgrestError) for ordinary org members, even
-- though the UI offers "Add Project" to everyone and the service-role
-- mobile path already allowed it. This is a regression vs. the original
-- per-org intent (see 20250805215522_initial_schema.sql).
--
-- Fix: add a dedicated INSERT policy that lets any member of the target
-- organization create a project in it, reusing the same
-- user_has_organization_access() helper the SELECT and UPDATE policies
-- already use. Additive and permissive; the existing "Admins can manage"
-- policy continues to govern UPDATE/DELETE. Applied to the production DB
-- on 2026-10-22 via the Management API; this migration makes it permanent
-- and keeps source in sync with prod.

DROP POLICY IF EXISTS "Org members can create projects" ON public.projects;
CREATE POLICY "Org members can create projects" ON public.projects
  FOR INSERT
  WITH CHECK (public.user_has_organization_access(organization_id));

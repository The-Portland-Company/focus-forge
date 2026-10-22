-- Fix: non-global-admin org members could not create projects.
--
-- The "Admins can manage projects in their organizations" policy on
-- public.projects is FOR ALL with a USING clause (global profiles.role
-- IN ('admin','super_admin') OR is_super_admin()) and NO WITH CHECK.
-- Postgres applies USING as the INSERT WITH CHECK, so INSERT was gated to
-- global admins only — the normal "New Project" flow (and POST
-- /api/projects) returned 500 ("Failed to create project", an RLS denial
-- surfaced as a PostgrestError) for ordinary org members, even though the
-- UI offers "Add Project" to everyone and the service-role mobile path
-- already allowed it. This is a regression vs. the original per-org intent
-- (see 20250805215522_initial_schema.sql).
--
-- Fix: give the existing FOR ALL policy an explicit WITH CHECK that lets
-- any member of the target organization INSERT/UPDATE a project in it,
-- reusing the same user_has_organization_access() helper the SELECT and
-- UPDATE policies already use. The USING clause is unchanged, so SELECT/
-- UPDATE/DELETE visibility still require the admin role on the existing
-- row. We intentionally do NOT add a second INSERT policy: a separate
-- permissive policy would trip the multiple_permissive_policies linter
-- (two permissive INSERT policies on public.projects). Keeping a single
-- policy avoids that.
--
-- Applied to the production DB on 2026-10-22 via the Management API with
-- approval; this migration keeps source in sync with prod.

ALTER POLICY "Admins can manage projects in their organizations"
  ON public.projects
  WITH CHECK (public.user_has_organization_access(organization_id));

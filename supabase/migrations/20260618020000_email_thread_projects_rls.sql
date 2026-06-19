-- Enable RLS on public.email_thread_projects (RLS audit, task 64a0bd45).
--
-- FINDING: email_thread_projects was the ONLY public table with RLS disabled
-- and zero policies, while holding the default Supabase grants
-- (SELECT/INSERT/UPDATE/DELETE/TRIGGER/REFERENCES/TRUNCATE) to BOTH `anon` and
-- `authenticated`. Because PostgREST exposes those roles over the public anon
-- key, any client could read, insert, update, or delete the entire
-- thread<->project mapping across all tenants directly via the REST API,
-- bypassing the app. This is a cross-tenant confidentiality + integrity hole.
--
-- FIX: mirror the already-secured sibling join table public.email_thread_tasks
-- exactly. Both tables key off `thread_id`, and access is gated by the existing
-- helper user_can_access_email_thread(thread_id, auth.uid()). Identical grants
-- on the sibling are harmless once RLS is on, because the reachable PostgREST
-- verbs (SELECT/INSERT/UPDATE/DELETE) are row-gated by the policies and
-- PostgREST exposes no TRUNCATE.
--
-- SAFETY: all app access to email_thread_projects goes through the service-role
-- admin client (lib/supabase/admin.ts -> getAdminClient, used in
-- lib/email-inbox/server.ts), which bypasses RLS. Enabling RLS therefore does
-- not change app behavior; it only closes the anon/authenticated REST hole.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.email_thread_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view email thread projects" ON public.email_thread_projects;
CREATE POLICY "Users can view email thread projects"
  ON public.email_thread_projects
  FOR SELECT
  USING (user_can_access_email_thread(thread_id, auth.uid()));

DROP POLICY IF EXISTS "Users can manage email thread projects" ON public.email_thread_projects;
CREATE POLICY "Users can manage email thread projects"
  ON public.email_thread_projects
  FOR ALL
  USING (user_can_access_email_thread(thread_id, auth.uid()))
  WITH CHECK (user_can_access_email_thread(thread_id, auth.uid()));

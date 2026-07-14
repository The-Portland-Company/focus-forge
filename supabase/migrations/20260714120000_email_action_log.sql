-- Debug audit trail for email inbox actions (delete/archive/mark-read/spam/…).
-- Purpose: diagnose the "deleted email reappears" race by recording the full
-- end-to-end timeline of each action — when it was requested, optimistically
-- applied on the client, when the server started/finished the status update,
-- any error, and any realtime re-add event. Rows are ephemeral debug data and
-- are auto-purged after 7 days (pg_cron below, with an app-side fallback noted
-- in lib/email-inbox/action-log.ts).
--
-- Follows the spam_signatures migration idiom for RLS/grants
-- (20260702193209_spam_training.sql): own-rows + super-admin, authenticated
-- grants. Writes happen through the service-role admin client (bypasses RLS),
-- so the policies here only gate direct authenticated reads (debug tooling).

CREATE TABLE IF NOT EXISTS public.email_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.email_threads(id) ON DELETE SET NULL,
  mailbox_id UUID REFERENCES public.mailboxes(id) ON DELETE SET NULL,
  -- Free text (not a hard CHECK) so new actions can be logged without a
  -- migration: 'delete','always_delete_sender','archive','spam','mark_read',
  -- 'mark_unread','restore','set_classification', etc.
  action TEXT NOT NULL,
  -- Where in the lifecycle this row was written:
  -- 'requested'      — API route received the request
  -- 'optimistic'     — client optimistically mutated local state
  -- 'server_start'   — server began the DB status update
  -- 'server_done'    — server committed the status update (detail has result)
  -- 'error'          — the action failed (detail has the message)
  -- 'realtime_event' — client observed a realtime change for the thread
  phase TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_action_log_created
  ON public.email_action_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_action_log_thread
  ON public.email_action_log (thread_id);
CREATE INDEX IF NOT EXISTS idx_email_action_log_user_created
  ON public.email_action_log (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — own rows + super-admin (mirrors spam_signatures).
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_email_action_log" ON public.email_action_log;
CREATE POLICY "owner_select_email_action_log" ON public.email_action_log FOR SELECT
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "owner_insert_email_action_log" ON public.email_action_log;
CREATE POLICY "owner_insert_email_action_log" ON public.email_action_log FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

GRANT SELECT, INSERT ON public.email_action_log TO authenticated;

-- ---------------------------------------------------------------------------
-- 7-day purge.
-- ---------------------------------------------------------------------------
-- Purge helper: delete rows older than 7 days. SECURITY DEFINER so the pg_cron
-- job (and the app-side throttled fallback in action-log.ts) can call it.
CREATE OR REPLACE FUNCTION public.purge_email_action_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.email_action_log
  WHERE created_at < now() - interval '7 days';
$$;

-- NOTE: pg_cron is NOT enabled on this project (confirmed 2026-07-14 — the
-- `cron` schema does not exist). The 7-day purge therefore runs via the
-- app-side throttled fallback in lib/email-inbox/action-log.ts, which calls
-- public.purge_email_action_log() at most once per hour. If pg_cron is enabled
-- later, schedule it manually:
--   select cron.schedule('purge_email_action_log', '15 4 * * *',
--                         $$ select public.purge_email_action_log(); $$);
-- (Kept out of this migration so it applies as a single transaction on hosts
-- without pg_cron — a cron.schedule() call there aborts the whole migration.)

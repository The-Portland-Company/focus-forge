-- Enable Supabase Realtime (postgres_changes) for public.email_threads so the
-- inbox UI updates near-instantly when the in-process IMAP IDLE worker writes
-- new rows, instead of waiting on the 30s browser poll.
--
-- RLS on email_threads is already enabled with owner-scoped SELECT policies
-- ("Users can view email threads" via public.user_can_access_mailbox) defined in
-- 20260329120000_fluid_inbox.sql, so Realtime respects existing row access — no
-- new policy is added here.

-- 1. REPLICA IDENTITY FULL so UPDATE/DELETE realtime payloads include the row's
--    columns (needed for the owner_user_id=eq.<userId> client filter to match on
--    UPDATE/DELETE events, not just INSERT).
ALTER TABLE public.email_threads REPLICA IDENTITY FULL;

-- 2. Add the table to the supabase_realtime publication (idempotent: only add if
--    not already a member, so re-runs do not error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'email_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_threads;
  END IF;
END
$$;

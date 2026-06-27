-- Enable Supabase Realtime (postgres_changes) for public.tasks so the task list
-- UI updates near-instantly when tasks are created / updated / completed, instead
-- of refetching on every render or focus.
--
-- RLS on public.tasks is already enabled with org/project-scoped policies
-- ("Users can view tasks in their projects"), so Realtime respects existing row
-- access — no policy is added or weakened here. The client subscription is further
-- filtered to the caller's accessible project ids; RLS remains the source of truth.

-- 1. REPLICA IDENTITY FULL so UPDATE/DELETE realtime payloads include the row's
--    columns (needed for the project_id=in.(...) client filter to match on
--    UPDATE/DELETE events, not just INSERT).
ALTER TABLE public.tasks REPLICA IDENTITY FULL;

-- 2. Add the table to the supabase_realtime publication (idempotent: only add if
--    not already a member, so re-runs do not error with "already member").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
END
$$;

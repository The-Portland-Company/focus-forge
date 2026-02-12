-- Fix Supabase security advisories:
-- 1. SECURITY DEFINER view: upcoming_recurring_tasks
-- 2. Mutable search_path on 7 functions

-- 1. Recreate upcoming_recurring_tasks view as SECURITY INVOKER (default)
DROP VIEW IF EXISTS public.upcoming_recurring_tasks;
CREATE VIEW public.upcoming_recurring_tasks AS
SELECT
  t.*,
  CASE
    WHEN t.recurring_pattern LIKE 'every day%' THEN t.due_date + INTERVAL '1 day'
    WHEN t.recurring_pattern LIKE 'every week%' THEN t.due_date + INTERVAL '1 week'
    WHEN t.recurring_pattern LIKE 'every month%' THEN t.due_date + INTERVAL '1 month'
    WHEN t.recurring_pattern LIKE 'every year%' THEN t.due_date + INTERVAL '1 year'
    ELSE t.due_date
  END as next_due_date
FROM public.tasks t
WHERE t.is_recurring = true
AND t.completed = false;

-- 2. Set immutable search_path on all flagged functions

ALTER FUNCTION public.handle_new_user() SET search_path = '';

ALTER FUNCTION public.update_updated_at_column() SET search_path = '';

ALTER FUNCTION public.check_sync_conflict(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = '';

ALTER FUNCTION public.get_next_sync_time(UUID) SET search_path = '';

ALTER FUNCTION public.log_todoist_api_call(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT) SET search_path = '';

ALTER FUNCTION public.check_todoist_rate_limit(UUID) SET search_path = '';

ALTER FUNCTION public.backup_before_todoist_import(UUID) SET search_path = '';

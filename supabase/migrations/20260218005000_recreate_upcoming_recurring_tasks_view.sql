-- Supabase Security Advisor: prefer SECURITY INVOKER views so RLS is evaluated for the caller.
-- Also qualify table references to work with hardened search_path settings.

DROP VIEW IF EXISTS public.upcoming_recurring_tasks;

CREATE VIEW public.upcoming_recurring_tasks
WITH (security_invoker = true)
AS
SELECT
  t.*,
  CASE
    WHEN t.recurring_pattern LIKE 'every day%' THEN t.due_date + INTERVAL '1 day'
    WHEN t.recurring_pattern LIKE 'every week%' THEN t.due_date + INTERVAL '1 week'
    WHEN t.recurring_pattern LIKE 'every month%' THEN t.due_date + INTERVAL '1 month'
    WHEN t.recurring_pattern LIKE 'every year%' THEN t.due_date + INTERVAL '1 year'
    ELSE t.due_date
  END AS next_due_date
FROM public.tasks t
WHERE t.is_recurring = true
  AND t.completed = false;


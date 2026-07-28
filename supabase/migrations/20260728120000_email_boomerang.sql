-- Boomerang an email out of the inbox until a date/time OR until a linked task
-- is completed. Both are nullable; a thread is "boomeranged" (hidden) while
-- boomerang_until is in the future, or while boomerang_task_id points at a task
-- that is not yet completed.
alter table public.email_threads
  add column if not exists boomerang_until timestamptz,
  add column if not exists boomerang_task_id uuid;

-- Cheap lookup for the task-completion hook (clear boomerang for a finished task).
create index if not exists email_threads_boomerang_task_idx
  on public.email_threads (boomerang_task_id)
  where boomerang_task_id is not null;

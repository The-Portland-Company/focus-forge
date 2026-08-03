-- Email priority, mirroring task priority (1 = urgent … 4 = low, NULL = unset).
-- Additive: existing threads keep NULL and render no flag until one is set.
alter table public.email_threads
  add column if not exists priority smallint;

alter table public.email_threads
  drop constraint if exists email_threads_priority_range;

alter table public.email_threads
  add constraint email_threads_priority_range
  check (priority is null or priority between 1 and 4);

-- Sorting/filtering by priority scans only the threads that have one set.
create index if not exists email_threads_priority_idx
  on public.email_threads (mailbox_id, priority)
  where priority is not null;

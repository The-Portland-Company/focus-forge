alter table public.tasks
add column if not exists snoozed_until timestamptz;

create index if not exists tasks_snoozed_until_idx
  on public.tasks (snoozed_until)
  where snoozed_until is not null;

-- Native task type: 'task' (default), 'bug', 'feature'.
--
-- Purely additive: new nullable-with-default column plus a check constraint
-- that only fires on future writes of a bad value (existing rows are all
-- backfilled to 'task' by the DEFAULT + UPDATE below, so the constraint has
-- nothing to violate on rollout).

begin;

alter table if exists public.tasks
  add column if not exists type text not null default 'task';

update public.tasks set type = 'task' where type is null;

alter table if exists public.tasks
  drop constraint if exists tasks_type_check;

alter table if exists public.tasks
  add constraint tasks_type_check check (type in ('task', 'bug', 'feature'));

create index if not exists idx_tasks_type on public.tasks (type);

commit;

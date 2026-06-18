-- Phase 1 of the fine-tuned-estimator plan: make task_estimate_examples a
-- fully user-curatable training set (HITL). Adds an UPDATE RLS policy (only
-- select/insert/delete existed) plus provenance columns so manually-added or
-- edited rows are distinguishable from auto-captured ("accepted") ones.
-- Idempotent: safe to re-run.

alter table public.task_estimate_examples
  add column if not exists source text not null default 'accepted';

alter table public.task_estimate_examples
  add column if not exists updated_at timestamptz not null default now();

-- Constrain provenance to the known set.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'task_estimate_examples_source_chk'
  ) then
    alter table public.task_estimate_examples
      add constraint task_estimate_examples_source_chk
      check (source in ('accepted', 'manual', 'edited'));
  end if;
end$$;

-- Allow owners to edit their own examples (was missing).
drop policy if exists "task_estimate_examples_own_update" on public.task_estimate_examples;
create policy "task_estimate_examples_own_update"
  on public.task_estimate_examples for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at fresh on any UPDATE (reuses the repo's shared trigger fn) so
-- rows touched outside the API still get a correct timestamp.
drop trigger if exists update_task_estimate_examples_updated_at on public.task_estimate_examples;
create trigger update_task_estimate_examples_updated_at
  before update on public.task_estimate_examples
  for each row execute function public.update_updated_at_column();

-- Add time_estimate column to tasks and a feedback-loop store for AI estimator calibration.

alter table public.tasks
  add column if not exists time_estimate integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_time_estimate_range_chk'
  ) then
    alter table public.tasks
      add constraint tasks_time_estimate_range_chk
      check (time_estimate is null or (time_estimate between 1 and 480));
  end if;
end$$;

-- Partial index to accelerate "next unestimated task" queries used by the review flow.
create index if not exists tasks_unestimated_priority_due_idx
  on public.tasks (priority, due_date, created_at)
  where time_estimate is null and completed = false;

-- Labeled examples used as few-shot calibration for future AI estimates.
create table if not exists public.task_estimate_examples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  task_name text not null,
  task_description text,
  project_name text,
  tags text[],
  priority integer,
  ai_suggested_minutes integer,
  ai_confidence text,
  accepted_minutes integer not null check (accepted_minutes between 1 and 480),
  created_at timestamptz not null default now()
);

create index if not exists task_estimate_examples_user_created_idx
  on public.task_estimate_examples (user_id, created_at desc);

alter table public.task_estimate_examples enable row level security;

drop policy if exists "task_estimate_examples_own_select" on public.task_estimate_examples;
create policy "task_estimate_examples_own_select"
  on public.task_estimate_examples for select
  using (auth.uid() = user_id);

drop policy if exists "task_estimate_examples_own_insert" on public.task_estimate_examples;
create policy "task_estimate_examples_own_insert"
  on public.task_estimate_examples for insert
  with check (auth.uid() = user_id);

drop policy if exists "task_estimate_examples_own_delete" on public.task_estimate_examples;
create policy "task_estimate_examples_own_delete"
  on public.task_estimate_examples for delete
  using (auth.uid() = user_id);

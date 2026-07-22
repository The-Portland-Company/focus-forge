-- "Supplies on hand": an itemized list of general supplies you already have,
-- attached to a project and optionally scoped to a section (task list) or a
-- task. Unlike is_supply tasks (things still to acquire, which are checked off
-- and deducted from a total), these are never completed — they're a reference
-- list of what's available. Kept in their own table so they don't pollute the
-- task list or its counts.
create table if not exists public.on_hand_supplies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  section_id uuid references public.sections(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  note text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists on_hand_supplies_project_id_idx
  on public.on_hand_supplies (project_id);
create index if not exists on_hand_supplies_section_id_idx
  on public.on_hand_supplies (section_id);
create index if not exists on_hand_supplies_task_id_idx
  on public.on_hand_supplies (task_id);

comment on table public.on_hand_supplies is
  'Itemized supplies already on hand, per project and optionally per section/task. Not checked off; distinct from is_supply tasks (to-acquire).';

alter table public.on_hand_supplies enable row level security;

-- Access mirrors sections: anyone with membership in the project''s
-- organization can read and manage that project''s on-hand supplies.
drop policy if exists "Users can view on-hand supplies in their projects"
  on public.on_hand_supplies;
create policy "Users can view on-hand supplies in their projects"
  on public.on_hand_supplies for select
  using (
    project_id in (
      select p.id from public.projects p
      join public.user_organizations uo
        on p.organization_id = uo.organization_id
      where uo.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can insert on-hand supplies in their projects"
  on public.on_hand_supplies;
create policy "Users can insert on-hand supplies in their projects"
  on public.on_hand_supplies for insert
  with check (
    project_id in (
      select p.id from public.projects p
      join public.user_organizations uo
        on p.organization_id = uo.organization_id
      where uo.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update on-hand supplies in their projects"
  on public.on_hand_supplies;
create policy "Users can update on-hand supplies in their projects"
  on public.on_hand_supplies for update
  using (
    project_id in (
      select p.id from public.projects p
      join public.user_organizations uo
        on p.organization_id = uo.organization_id
      where uo.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete on-hand supplies in their projects"
  on public.on_hand_supplies;
create policy "Users can delete on-hand supplies in their projects"
  on public.on_hand_supplies for delete
  using (
    project_id in (
      select p.id from public.projects p
      join public.user_organizations uo
        on p.organization_id = uo.organization_id
      where uo.user_id = (select auth.uid())
    )
  );

drop trigger if exists update_on_hand_supplies_updated_at
  on public.on_hand_supplies;
create trigger update_on_hand_supplies_updated_at
  before update on public.on_hand_supplies
  for each row execute function public.update_updated_at_column();

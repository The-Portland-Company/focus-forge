-- Specs ⇄ Forge connector infrastructure (P4.G1, P4.G2, P5.G1).
-- See politogy/docs/sync-contract.md (v1) for the binding contract this
-- migration implements the Forge side of.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------
-- 1. connectors (kill switch + per-connector status, §11)
-- ---------------------------------------------------------------------
create table if not exists public.connectors (
  id text primary key,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.connectors (id, enabled)
values ('specs', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. external_links (generic cross-system id mapping)
-- ---------------------------------------------------------------------
create table if not exists public.external_links (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  external_system text not null,
  external_id text not null,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, external_system)
);

-- ---------------------------------------------------------------------
-- 3. additive sync columns (§1 id mapping, §6 ownership, §7 loop guard)
-- ---------------------------------------------------------------------
alter table public.projects
  add column if not exists specs_id uuid,
  add column if not exists origin text,
  add column if not exists sync_hash text,
  add column if not exists mode_kind text,
  add column if not exists spec_slug text;

alter table public.sections
  add column if not exists specs_id uuid,
  add column if not exists origin text,
  add column if not exists sync_hash text,
  add column if not exists order_index integer;

alter table public.goals
  add column if not exists specs_id uuid,
  add column if not exists origin text,
  add column if not exists sync_hash text;

alter table public.tasks
  add column if not exists specs_id uuid,
  add column if not exists origin text,
  add column if not exists sync_hash text,
  add column if not exists status text,
  add column if not exists progress integer,
  add column if not exists estimate_min integer,
  add column if not exists time_logged_min integer,
  add column if not exists acceptance text,
  add column if not exists order_index integer;

create index if not exists projects_specs_id_idx on public.projects (specs_id) where specs_id is not null;
create index if not exists sections_specs_id_idx on public.sections (specs_id) where specs_id is not null;
create index if not exists goals_specs_id_idx on public.goals (specs_id) where specs_id is not null;
create index if not exists tasks_specs_id_idx on public.tasks (specs_id) where specs_id is not null;

-- ---------------------------------------------------------------------
-- 4. outbox / inbound dedupe / dead letters (§3, §9, §10)
-- ---------------------------------------------------------------------
create table if not exists public.sync_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default gen_random_uuid(),
  entity text not null,
  op text not null,
  entity_id uuid not null,
  data jsonb not null,
  sync_hash text,
  occurred_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  dead boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sync_outbox_pending_idx
  on public.sync_outbox (next_attempt_at)
  where sent_at is null and dead = false;

create table if not exists public.sync_events_seen (
  event_id uuid primary key,
  origin text not null,
  entity text not null,
  entity_id uuid not null,
  applied boolean not null default false,
  seen_at timestamptz not null default now()
);

create table if not exists public.sync_dead_letters (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  entity text not null,
  op text not null,
  entity_id uuid not null,
  data jsonb not null,
  last_error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. outbound-sync triggers on goals/tasks/sections (§3, §5, §7)
--
-- Skip entirely when app.is_connector is 'on' (the write is our own
-- connector_upsert_* RPC applying an inbound Specs event) -- this is the
-- primary loop guard, same GUC pattern as enforce_project_lock in
-- 20261003000000_project_locks.sql. On top of that, compare the freshly
-- computed hash to the row's stored sync_hash and skip a no-op write (a
-- dedup optimization, not required for correctness since the receiver's
-- event-id idempotency and hash-equality checks are the real backstop).
-- ---------------------------------------------------------------------

create or replace function public.enqueue_sync_outbox_section()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_data jsonb;
  v_op text;
begin
  if current_setting('app.is_connector', true) = 'on' then
    return coalesce(new, old);
  end if;

  v_data := jsonb_build_object(
    'project_id', coalesce(new.project_id, old.project_id),
    'title', coalesce(new.name, old.name),
    'order', coalesce(new.order_index, old.order_index, 0),
    'deleted_at', coalesce(new.deleted_at, old.deleted_at)
  );
  v_hash := 'sha256:' || encode(digest(v_data::text, 'sha256'), 'hex');

  if tg_op = 'UPDATE' and v_hash = old.sync_hash then
    return new;
  end if;

  v_op := case
    when tg_op = 'INSERT' then 'create'
    when (new.deleted_at is not null and old.deleted_at is null) then 'delete'
    else 'update'
  end;

  insert into public.sync_outbox (entity, op, entity_id, data, sync_hash)
  values ('section', v_op, coalesce(new.id, old.id), v_data, v_hash);

  if tg_op != 'DELETE' then
    new.sync_hash := v_hash;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.enqueue_sync_outbox_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_data jsonb;
  v_op text;
begin
  if current_setting('app.is_connector', true) = 'on' then
    return coalesce(new, old);
  end if;

  v_data := jsonb_build_object(
    'project_id', coalesce(new.project_id, old.project_id),
    'section_id', coalesce(new.section_id, old.section_id),
    'parent_goal_id', coalesce(new.parent_goal_id, old.parent_goal_id),
    'title', coalesce(new.name, old.name),
    'body', coalesce(new.description, old.description),
    'order', coalesce(new.order_index, old.order_index, 0),
    'deleted_at', coalesce(new.deleted_at, old.deleted_at)
  );
  v_hash := 'sha256:' || encode(digest(v_data::text, 'sha256'), 'hex');

  if tg_op = 'UPDATE' and v_hash = old.sync_hash then
    return new;
  end if;

  v_op := case
    when tg_op = 'INSERT' then 'create'
    when (new.deleted_at is not null and old.deleted_at is null) then 'delete'
    else 'update'
  end;

  insert into public.sync_outbox (entity, op, entity_id, data, sync_hash)
  values ('goal', v_op, coalesce(new.id, old.id), v_data, v_hash);

  if tg_op != 'DELETE' then
    new.sync_hash := v_hash;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.enqueue_sync_outbox_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_data jsonb;
  v_op text;
begin
  if current_setting('app.is_connector', true) = 'on' then
    return coalesce(new, old);
  end if;

  v_data := jsonb_build_object(
    'goal_id', coalesce(new.goal_id, old.goal_id),
    'parent_task_id', coalesce(new.parent_id, old.parent_id),
    'title', coalesce(new.name, old.name),
    'body', coalesce(new.description, old.description),
    'acceptance', coalesce(new.acceptance, old.acceptance),
    'order', coalesce(new.order_index, old.order_index, 0),
    'status', coalesce(new.status, old.status, case when coalesce(new.completed, old.completed) then 'done' else 'todo' end),
    'progress', coalesce(new.progress, old.progress, 0),
    'estimate_min', coalesce(new.estimate_min, old.estimate_min, new.time_estimate, old.time_estimate, 0),
    'time_logged_min', coalesce(new.time_logged_min, old.time_logged_min, 0),
    'due_at', coalesce(new.due_date, old.due_date),
    'start_at', coalesce(new.start_date, old.start_date),
    'assignee', coalesce(new.assigned_to, old.assigned_to),
    'deleted_at', coalesce(new.deleted_at, old.deleted_at)
  );
  v_hash := 'sha256:' || encode(digest(v_data::text, 'sha256'), 'hex');

  if tg_op = 'UPDATE' and v_hash = old.sync_hash then
    return new;
  end if;

  v_op := case
    when tg_op = 'INSERT' then 'create'
    when (new.deleted_at is not null and old.deleted_at is null) then 'delete'
    else 'update'
  end;

  insert into public.sync_outbox (entity, op, entity_id, data, sync_hash)
  values ('task', v_op, coalesce(new.id, old.id), v_data, v_hash);

  if tg_op != 'DELETE' then
    new.sync_hash := v_hash;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.enqueue_sync_outbox_section() from public, anon, authenticated;
revoke all on function public.enqueue_sync_outbox_goal() from public, anon, authenticated;
revoke all on function public.enqueue_sync_outbox_task() from public, anon, authenticated;

drop trigger if exists sync_outbox_section on public.sections;
create trigger sync_outbox_section
  before insert or update on public.sections
  for each row
  execute function public.enqueue_sync_outbox_section();

drop trigger if exists sync_outbox_goal on public.goals;
create trigger sync_outbox_goal
  before insert or update on public.goals
  for each row
  execute function public.enqueue_sync_outbox_goal();

drop trigger if exists sync_outbox_task on public.tasks;
create trigger sync_outbox_task
  before insert or update on public.tasks
  for each row
  execute function public.enqueue_sync_outbox_task();

-- ---------------------------------------------------------------------
-- 6. connector_upsert_* RPCs -- the inbound-apply entry points the
-- webhook (app/api/connectors/specs/events) calls for each incoming
-- event. service_role only. Each sets the app.is_connector GUC so the
-- outbound triggers above don't immediately re-enqueue an echo, and
-- stamps origin='specs' + sync_hash + specs_id for the loop guard.
-- ---------------------------------------------------------------------

create or replace function public.connector_upsert_project(
  p_id uuid,
  p_title text,
  p_parent_id uuid default null,
  p_mode_kind text default null,
  p_spec_slug text default null,
  p_sync_hash text default null,
  p_deleted_at timestamptz default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.projects;
begin
  perform set_config('app.is_connector', 'on', true);

  insert into public.projects (
    id, name, parent_id, locked, lock_source, mode_kind, spec_slug,
    specs_id, origin, sync_hash, deleted_at
  )
  values (
    p_id, p_title, p_parent_id, true, 'specs', p_mode_kind, p_spec_slug,
    p_id, 'specs', p_sync_hash, p_deleted_at
  )
  on conflict (id) do update set
    name = excluded.name,
    parent_id = excluded.parent_id,
    locked = true,
    lock_source = 'specs',
    mode_kind = excluded.mode_kind,
    spec_slug = excluded.spec_slug,
    specs_id = excluded.specs_id,
    origin = 'specs',
    sync_hash = excluded.sync_hash,
    deleted_at = excluded.deleted_at,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.connector_upsert_section(
  p_id uuid,
  p_project_id uuid,
  p_title text,
  p_order integer default 0,
  p_sync_hash text default null,
  p_deleted_at timestamptz default null
)
returns public.sections
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.sections;
begin
  perform set_config('app.is_connector', 'on', true);

  insert into public.sections (
    id, project_id, name, order_index, specs_id, origin, sync_hash, deleted_at
  )
  values (
    p_id, p_project_id, p_title, p_order, p_id, 'specs', p_sync_hash, p_deleted_at
  )
  on conflict (id) do update set
    project_id = excluded.project_id,
    name = excluded.name,
    order_index = excluded.order_index,
    specs_id = excluded.specs_id,
    origin = 'specs',
    sync_hash = excluded.sync_hash,
    deleted_at = excluded.deleted_at,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.connector_upsert_goal(
  p_id uuid,
  p_project_id uuid,
  p_section_id uuid default null,
  p_parent_goal_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_order integer default 0,
  p_sync_hash text default null,
  p_deleted_at timestamptz default null
)
returns public.goals
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.goals;
begin
  perform set_config('app.is_connector', 'on', true);

  insert into public.goals (
    id, project_id, section_id, parent_goal_id, name, description,
    order_index, specs_id, origin, sync_hash, deleted_at
  )
  values (
    p_id, p_project_id, p_section_id, p_parent_goal_id, p_title, p_body,
    p_order, p_id, 'specs', p_sync_hash, p_deleted_at
  )
  on conflict (id) do update set
    project_id = excluded.project_id,
    section_id = excluded.section_id,
    parent_goal_id = excluded.parent_goal_id,
    name = excluded.name,
    description = excluded.description,
    order_index = excluded.order_index,
    specs_id = excluded.specs_id,
    origin = 'specs',
    sync_hash = excluded.sync_hash,
    deleted_at = excluded.deleted_at,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.connector_upsert_task(
  p_id uuid,
  p_goal_id uuid default null,
  p_parent_task_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_acceptance text default null,
  p_order integer default 0,
  p_status text default null,
  p_progress integer default null,
  p_estimate_min integer default null,
  p_time_logged_min integer default null,
  p_due_at timestamptz default null,
  p_start_at timestamptz default null,
  p_assignee text default null,
  p_sync_hash text default null,
  p_deleted_at timestamptz default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.tasks;
  v_project_id uuid;
  v_completed boolean;
begin
  perform set_config('app.is_connector', 'on', true);

  if p_goal_id is not null then
    select project_id into v_project_id from public.goals where id = p_goal_id;
  end if;
  v_completed := (p_status = 'done');

  insert into public.tasks (
    id, goal_id, parent_id, project_id, name, description, acceptance,
    order_index, status, progress, estimate_min, time_logged_min,
    due_date, start_date, assigned_to, completed,
    specs_id, origin, sync_hash, deleted_at, type
  )
  values (
    p_id, p_goal_id, p_parent_task_id, v_project_id, p_title, p_body, p_acceptance,
    p_order, p_status, p_progress, p_estimate_min, p_time_logged_min,
    p_due_at, p_start_at, p_assignee, coalesce(v_completed, false),
    p_id, 'specs', p_sync_hash, p_deleted_at, 'task'
  )
  on conflict (id) do update set
    goal_id = excluded.goal_id,
    parent_id = excluded.parent_id,
    project_id = coalesce(excluded.project_id, public.tasks.project_id),
    name = excluded.name,
    description = excluded.description,
    acceptance = excluded.acceptance,
    order_index = excluded.order_index,
    status = excluded.status,
    progress = excluded.progress,
    estimate_min = excluded.estimate_min,
    time_logged_min = excluded.time_logged_min,
    due_date = excluded.due_date,
    start_date = excluded.start_date,
    assigned_to = excluded.assigned_to,
    completed = excluded.completed,
    specs_id = excluded.specs_id,
    origin = 'specs',
    sync_hash = excluded.sync_hash,
    deleted_at = excluded.deleted_at,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.connector_upsert_project(uuid, text, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.connector_upsert_section(uuid, uuid, text, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public.connector_upsert_goal(uuid, uuid, uuid, uuid, text, text, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public.connector_upsert_task(uuid, uuid, uuid, text, text, text, integer, text, integer, integer, integer, timestamptz, timestamptz, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.connector_upsert_project(uuid, text, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.connector_upsert_section(uuid, uuid, text, integer, text, timestamptz) to service_role;
grant execute on function public.connector_upsert_goal(uuid, uuid, uuid, uuid, text, text, integer, text, timestamptz) to service_role;
grant execute on function public.connector_upsert_task(uuid, uuid, uuid, text, text, text, integer, text, integer, integer, integer, timestamptz, timestamptz, text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 7. RLS -- all five tables here are service_role-only (the connector
-- webhook, worker and settings-status route are the only callers, all
-- using the service-role admin client which bypasses RLS). Enabling RLS
-- with no policies for anon/authenticated locks ordinary app clients out
-- entirely, satisfying the Supabase Advisor's rls_disabled_in_public
-- check without opening these tables up to end users.
-- ---------------------------------------------------------------------
alter table public.connectors enable row level security;
alter table public.external_links enable row level security;
alter table public.sync_outbox enable row level security;
alter table public.sync_events_seen enable row level security;
alter table public.sync_dead_letters enable row level security;

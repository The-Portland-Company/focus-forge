-- Project locks (Specs ⇄ Forge sync, P1.G3/P1.G5).
--
-- A locked project (a Specs Mode or the Platform sub-project) cannot be
-- deleted, renamed or re-parented from the app. Only the connector, acting
-- through the connector_* RPCs below (which run as role `service_role` and
-- flip the `app.is_connector` transaction-local GUC before touching the
-- row), may do those things. Plain app writes — including the mobile API,
-- which also runs under the service-role admin client — go through ordinary
-- table UPDATE/DELETE and are blocked by the trigger when the row is locked.
--
-- Idempotent: safe to re-run.

alter table public.projects
  add column if not exists locked boolean not null default false,
  add column if not exists lock_source text;

comment on column public.projects.locked is
  'true for a Specs-owned project (Mode or Platform). Delete/rename/re-parent blocked unless done via the connector_* RPCs.';
comment on column public.projects.lock_source is
  'Why this project is locked, e.g. "specs:mode" or "specs:platform". Null when not locked.';

create or replace function public.enforce_project_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.is_connector', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.locked then
      raise exception 'project_locked: cannot delete locked project %', old.id
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- UPDATE: block rename / re-parent / (soft-)delete / unlocking a locked
  -- project from the app. Deletes in this app are soft deletes — projects.*
  -- RPC sets deleted_at via UPDATE, never a real DELETE — so that is checked
  -- here too, not only in the DELETE branch above.
  if old.locked then
    if new.name is distinct from old.name then
      raise exception 'project_locked: cannot rename locked project %', old.id
        using errcode = 'P0001';
    end if;
    if new.parent_id is distinct from old.parent_id then
      raise exception 'project_locked: cannot re-parent locked project %', old.id
        using errcode = 'P0001';
    end if;
    if old.deleted_at is null and new.deleted_at is not null then
      raise exception 'project_locked: cannot delete locked project %', old.id
        using errcode = 'P0001';
    end if;
    if new.locked is distinct from old.locked
      or new.lock_source is distinct from old.lock_source then
      raise exception 'project_locked: cannot change lock state of project %', old.id
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists project_lock_guard on public.projects;
create trigger project_lock_guard
  before update or delete on public.projects
  for each row
  execute function public.enforce_project_lock();

-- Connector-only entry points. These set the transaction-local bypass GUC
-- before performing the write, so the trigger above lets them through
-- regardless of current lock state. Granted to service_role only — the
-- connector is the sole caller; the mobile/app admin client must not call
-- these for ordinary user-driven edits.

create or replace function public.connector_set_project_lock(
  p_project_id uuid,
  p_locked boolean,
  p_lock_source text default null
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
  update public.projects
    set locked = p_locked,
        lock_source = p_lock_source
    where id = p_project_id
    returning * into result;
  return result;
end;
$$;

create or replace function public.connector_rename_project(
  p_project_id uuid,
  p_name text,
  p_parent_id uuid default null,
  p_set_parent boolean default false
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
  if p_set_parent then
    update public.projects
      set name = p_name,
          parent_id = p_parent_id
      where id = p_project_id
      returning * into result;
  else
    update public.projects
      set name = p_name
      where id = p_project_id
      returning * into result;
  end if;
  return result;
end;
$$;

-- Deletes in this app are soft deletes (deleted_at via the shared
-- soft_delete_entity cascade), so the connector uses that same cascade
-- rather than a hard DELETE, just with the lock bypass set first.
create or replace function public.connector_delete_project(
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
begin
  perform set_config('app.is_connector', 'on', true);
  v_batch := public.soft_delete_entity('project', p_project_id);
  return v_batch;
end;
$$;

revoke all on function public.connector_set_project_lock(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.connector_rename_project(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.connector_delete_project(uuid) from public, anon, authenticated;
grant execute on function public.connector_set_project_lock(uuid, boolean, text) to service_role;
grant execute on function public.connector_rename_project(uuid, text, uuid, boolean) to service_role;
grant execute on function public.connector_delete_project(uuid) to service_role;

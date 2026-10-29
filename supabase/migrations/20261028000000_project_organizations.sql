-- Multi-organization project ownership, step A of 2 (ADDITIVE).
--
-- One project can now be owned by / visible to several organizations.
-- `projects.organization_id` stays the PRIMARY owner (unchanged column, FK and
-- all existing readers keep working). `project_organizations` lists EVERY org
-- on a project: one `is_primary = true` row mirroring projects.organization_id
-- (kept in sync by trigger) plus one row per additional org.
--
-- Access rule (see user_has_project_org_access): the caller belongs to the
-- project's primary org OR any org linked in project_organizations (or is a
-- super admin, exactly like user_has_organization_access).
--
-- This migration changes NO existing policy. Policy rewrites live in
-- 20261028000100_project_organizations_rls.sql. With only primary rows
-- present (the state right after this migration) the new helpers answer
-- exactly what user_has_organization_access(projects.organization_id) did.
--
-- Rollback: supabase/rollbacks/20261028000000_project_organizations_down.sql
-- (run the B-step rollback first).

begin;

-- ---------------------------------------------------------------------------
-- 1. Join table
-- ---------------------------------------------------------------------------
create table if not exists public.project_organizations (
  project_id      uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- 'manager' = org owners may administer the project (edit/delete/membership);
  -- 'member'  = org members can work in the project (RLS identical) but org
  --             owners get no project-admin rights. App-layer distinction only.
  role            text not null default 'manager' check (role in ('manager', 'member')),
  is_primary      boolean not null default false,
  added_by        uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (project_id, organization_id)
);

-- At most one primary row per project.
create unique index if not exists project_organizations_one_primary_idx
  on public.project_organizations (project_id) where is_primary;
create index if not exists project_organizations_org_idx
  on public.project_organizations (organization_id);

comment on table public.project_organizations is
  'Every organization that owns/sees a project. is_primary row mirrors projects.organization_id (trigger-synced); other rows are additional (shared) orgs.';

alter table public.project_organizations enable row level security;

revoke all on public.project_organizations from anon, public;
grant select, insert, update, delete on public.project_organizations to authenticated;
grant all on public.project_organizations to service_role;

-- ---------------------------------------------------------------------------
-- 2. Backfill: one primary row per existing project (idempotent)
-- ---------------------------------------------------------------------------
insert into public.project_organizations (project_id, organization_id, role, is_primary)
select p.id, p.organization_id, 'manager', true
from public.projects p
where p.organization_id is not null
on conflict (project_id, organization_id) do update set is_primary = true;

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER helpers (search_path = '' like the hardened helpers)
-- ---------------------------------------------------------------------------

-- Membership in any org of the project; NO super-admin shortcut. Replaces the
-- inline "projects JOIN user_organizations" policy pattern 1:1.
create or replace function public.user_belongs_to_project_org(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_organizations uo
    where uo.user_id = auth.uid()
      and (
        uo.organization_id in (
          select po.organization_id from public.project_organizations po
          where po.project_id = p_project_id
        )
        or uo.organization_id = (
          select p.organization_id from public.projects p where p.id = p_project_id
        )
      )
  );
$function$;

-- Drop-in for user_has_organization_access(p.organization_id): any org of the
-- project, OR super admin.
create or replace function public.user_has_project_org_access(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select public.user_belongs_to_project_org(p_project_id)
         or public.is_super_admin();
$function$;

-- All org ids on a project (primary + additional). Rows are returned only to
-- callers who can access the project (or to non-user contexts such as
-- service_role / direct SQL where auth.uid() is null).
create or replace function public.project_org_ids(p_project_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $function$
  select x.organization_id
  from (
    select po.organization_id
    from public.project_organizations po
    where po.project_id = p_project_id
    union
    select p.organization_id
    from public.projects p
    where p.id = p_project_id and p.organization_id is not null
  ) x
  where auth.uid() is null
     or public.user_has_project_org_access(p_project_id);
$function$;

-- True when the caller may administer the project: global admin/super_admin,
-- owner of the primary org, or owner of an additional org linked with
-- role = 'manager'. (Parity with is_org_admin on the primary org when the
-- project is not shared.)
create or replace function public.is_project_org_admin(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select
    exists (
      select 1 from public.projects p
      where p.id = p_project_id
        and public.is_org_admin(auth.uid(), p.organization_id)
    )
    or exists (
      select 1
      from public.project_organizations po
      join public.user_organizations uo
        on uo.organization_id = po.organization_id
      where po.project_id = p_project_id
        and po.role = 'manager'
        and uo.user_id = auth.uid()
        and uo.is_owner = true
    );
$function$;

-- Only admins of the PRIMARY org (or global admins) may add/remove orgs.
create or replace function public.is_project_primary_org_admin(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and public.is_org_admin(auth.uid(), p.organization_id)
  );
$function$;

revoke execute on function public.user_belongs_to_project_org(uuid) from public, anon;
revoke execute on function public.user_has_project_org_access(uuid) from public, anon;
revoke execute on function public.project_org_ids(uuid) from public, anon;
revoke execute on function public.is_project_org_admin(uuid) from public, anon;
revoke execute on function public.is_project_primary_org_admin(uuid) from public, anon;
grant execute on function public.user_belongs_to_project_org(uuid) to authenticated, service_role;
grant execute on function public.user_has_project_org_access(uuid) to authenticated, service_role;
grant execute on function public.project_org_ids(uuid) to authenticated, service_role;
grant execute on function public.is_project_org_admin(uuid) to authenticated, service_role;
grant execute on function public.is_project_primary_org_admin(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS on project_organizations
-- ---------------------------------------------------------------------------
drop policy if exists project_organizations_select on public.project_organizations;
create policy project_organizations_select on public.project_organizations
  for select
  using (public.user_has_project_org_access(project_id));

-- Primary rows are trigger-managed: user writes may only touch non-primary
-- rows, and only primary-org admins may do so.
drop policy if exists project_organizations_insert on public.project_organizations;
create policy project_organizations_insert on public.project_organizations
  for insert
  with check (not is_primary and public.is_project_primary_org_admin(project_id));

drop policy if exists project_organizations_update on public.project_organizations;
create policy project_organizations_update on public.project_organizations
  for update
  using (not is_primary and public.is_project_primary_org_admin(project_id))
  with check (not is_primary and public.is_project_primary_org_admin(project_id));

drop policy if exists project_organizations_delete on public.project_organizations;
create policy project_organizations_delete on public.project_organizations
  for delete
  using (not is_primary and public.is_project_primary_org_admin(project_id));

-- ---------------------------------------------------------------------------
-- 5. Keep the primary row in sync with projects.organization_id
-- ---------------------------------------------------------------------------
create or replace function public.sync_project_primary_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.organization_id is not distinct from new.organization_id then
    return new;
  end if;

  -- Moving the primary owner replaces the old primary link (same "move"
  -- semantics the single-org model had). Additional links are untouched.
  if tg_op = 'UPDATE' and old.organization_id is not null then
    delete from public.project_organizations
    where project_id = new.id
      and organization_id = old.organization_id
      and is_primary;
  end if;

  if new.organization_id is not null then
    insert into public.project_organizations (project_id, organization_id, role, is_primary)
    values (new.id, new.organization_id, 'manager', true)
    on conflict (project_id, organization_id)
    do update set is_primary = true;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_sync_project_primary_org on public.projects;
create trigger trg_sync_project_primary_org
  after insert or update of organization_id on public.projects
  for each row execute function public.sync_project_primary_org();

-- Because projects UPDATE RLS cannot restrict columns, a member of an
-- additional org could otherwise re-point organization_id at their own org and
-- thereby evict the owner. For SHARED projects only, changing the primary org
-- from a user session requires being an admin of the OLD primary org.
-- service_role / SQL sessions (auth.uid() null) and the org-delete reassign
-- path below are exempt. Non-shared projects behave exactly as before.
create or replace function public.guard_project_primary_org_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.organization_id is not distinct from new.organization_id then
    return new;
  end if;
  if auth.uid() is null
     or coalesce(current_setting('ff.reassigning_primary_org', true), '') = '1' then
    return new;
  end if;
  if exists (
       select 1 from public.project_organizations po
       where po.project_id = old.id and not po.is_primary
     )
     and not public.is_org_admin(auth.uid(), old.organization_id) then
    raise exception 'only an admin of the primary organization can change the primary organization of a shared project'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_project_primary_org_change on public.projects;
create trigger trg_guard_project_primary_org_change
  before update of organization_id on public.projects
  for each row execute function public.guard_project_primary_org_change();

-- ---------------------------------------------------------------------------
-- 6. Deleting an organization must never delete a project another org shares.
--    projects.organization_id keeps ON DELETE CASCADE (unshared projects are
--    removed with their org exactly as before). BEFORE DELETE we hand every
--    shared project to its oldest remaining org, then fail closed if any
--    shared project would still be cascaded.
-- ---------------------------------------------------------------------------
create or replace function public.reassign_shared_projects_before_org_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r record;
begin
  perform set_config('ff.reassigning_primary_org', '1', true);

  for r in
    select p.id as project_id,
           (select po.organization_id
              from public.project_organizations po
             where po.project_id = p.id and po.organization_id <> old.id
             order by po.created_at, po.organization_id
             limit 1) as next_org
      from public.projects p
     where p.organization_id = old.id
  loop
    if r.next_org is not null then
      update public.projects set organization_id = r.next_org where id = r.project_id;
    end if;
  end loop;

  perform set_config('ff.reassigning_primary_org', '', true);

  if exists (
    select 1
      from public.projects p
     where p.organization_id = old.id
       and exists (
         select 1 from public.project_organizations po
          where po.project_id = p.id and po.organization_id <> old.id
       )
  ) then
    raise exception 'refusing to delete organization %: a project it owns is shared with another organization and could not be reassigned', old.id;
  end if;

  return old;
end;
$function$;

drop trigger if exists trg_reassign_shared_projects_before_org_delete on public.organizations;
create trigger trg_reassign_shared_projects_before_org_delete
  before delete on public.organizations
  for each row execute function public.reassign_shared_projects_before_org_delete();

commit;

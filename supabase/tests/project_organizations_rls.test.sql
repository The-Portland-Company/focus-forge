-- Multi-org project ownership: RLS / trigger / helper assertions.
-- Runs against a scratch database that has ALL migrations applied, inside one
-- transaction that is rolled back. Any failed assertion raises and aborts.
-- Driven by scripts/test-project-orgs-rls.sh (run from the web/ directory).
\set ON_ERROR_STOP on
begin;
\i supabase/tests/project_organizations_seed.sql

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

create or replace function pg_temp.become(p_user text) returns void language plpgsql as $f$
begin
  reset role;
  if p_user is null then
    perform set_config('request.jwt.claim.sub', '', true);
    return;
  end if;
  perform set_config('request.jwt.claim.sub', md5('u:' || p_user)::uuid::text, true);
  set local role authenticated;
end $f$;

-- rows visible/affected by a statement, as the current user
create or replace function pg_temp.cnt(p_sql text) returns bigint language plpgsql as $f$
declare n bigint;
begin execute 'select count(*) from (' || p_sql || ') q' into n; return n; end $f$;

-- DML as current user: rows affected, or -1 if it raised
create or replace function pg_temp.dml(p_sql text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  begin execute p_sql; get diagnostics n = row_count; return n;
  exception when others then return -1; end;
end $f$;

create or replace function pg_temp.ok(p_name text, p_cond boolean) returns void language plpgsql as $f$
begin
  if p_cond is not true then raise exception 'ASSERTION FAILED: %', p_name; end if;
  raise notice 'ok - %', p_name;
end $f$;
grant execute on function pg_temp.become(text), pg_temp.cnt(text), pg_temp.dml(text), pg_temp.ok(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Trigger-maintained primary rows + backfill shape
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.ok('every seeded project has exactly one primary link',
    (select count(*) from public.project_organizations where is_primary and project_id in (md5('P1')::uuid, md5('P2')::uuid, md5('P3')::uuid)) = 3);
  perform pg_temp.ok('primary link mirrors projects.organization_id',
    not exists (select 1 from public.projects p left join public.project_organizations po
                 on po.project_id = p.id and po.is_primary
                where p.organization_id is not null and po.organization_id is distinct from p.organization_id));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Before sharing: client org sees nothing of P2
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.become('memB');
  perform pg_temp.ok('memB sees no P2 before sharing', pg_temp.cnt($q$select 1 from public.projects where name = 'P2'$q$) = 0);
  perform pg_temp.ok('memB sees no P2 tasks before sharing', pg_temp.cnt($q$select 1 from public.tasks where name = 'task:P2'$q$) = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Who may add an org
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.become('memA');
  perform pg_temp.ok('plain member of primary org cannot link an org',
    pg_temp.dml(format($q$insert into public.project_organizations (project_id, organization_id) values (%L, %L)$q$, md5('P2')::uuid, md5('org:B')::uuid)) = -1);
  perform pg_temp.become('ownB');
  perform pg_temp.ok('owner of the CLIENT org cannot link itself to someone elses project',
    pg_temp.dml(format($q$insert into public.project_organizations (project_id, organization_id) values (%L, %L)$q$, md5('P1')::uuid, md5('org:B')::uuid)) = -1);
  perform pg_temp.become('ownC');
  perform pg_temp.ok('unrelated org owner cannot link',
    pg_temp.dml(format($q$insert into public.project_organizations (project_id, organization_id) values (%L, %L)$q$, md5('P2')::uuid, md5('org:C')::uuid)) = -1);
  perform pg_temp.become('ownA');
  perform pg_temp.ok('primary-org owner CAN share P2 with B (role manager)',
    pg_temp.dml(format($q$insert into public.project_organizations (project_id, organization_id, role) values (%L, %L, 'manager')$q$, md5('P2')::uuid, md5('org:B')::uuid)) = 1);
  perform pg_temp.ok('primary link cannot be forged by a user',
    pg_temp.dml(format($q$insert into public.project_organizations (project_id, organization_id, is_primary) values (%L, %L, true)$q$, md5('P2')::uuid, md5('org:C')::uuid)) = -1);
  perform pg_temp.ok('primary link cannot be deleted by a user',
    pg_temp.dml(format($q$delete from public.project_organizations where project_id = %L and is_primary$q$, md5('P2')::uuid)) = 0);
  perform pg_temp.ok('primary link cannot be demoted by a user',
    pg_temp.dml(format($q$update public.project_organizations set is_primary = false where project_id = %L and is_primary$q$, md5('P2')::uuid)) = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 4. After sharing: B members have FULL access to P2 and nothing else of A
-- ---------------------------------------------------------------------------
do $$
declare u text;
begin
  foreach u in array array['ownB','memB','both'] loop
    perform pg_temp.become(u);
    perform pg_temp.ok(u || ' sees P2', pg_temp.cnt($q$select 1 from public.projects where name = 'P2'$q$) = 1);
    perform pg_temp.ok(u || ' does NOT see P1', pg_temp.cnt($q$select 1 from public.projects where name = 'P1'$q$) = (case when u = 'both' then 1 else 0 end));
    perform pg_temp.ok(u || ' sees P2 tasks/sections/goals',
      pg_temp.cnt($q$select 1 from public.tasks where name = 'task:P2'$q$) = 1
      and pg_temp.cnt($q$select 1 from public.sections where name = 'section:P2'$q$) = 1
      and pg_temp.cnt($q$select 1 from public.goals where name = 'goal:P2'$q$) = 1);
    perform pg_temp.ok(u || ' sees P2 comments (task + project), supplies, shares, attachments, reminders, tags, task_sections',
      pg_temp.cnt($q$select 1 from public.comments where content in ('comment-task:P2','comment-proj:P2')$q$) = 2
      and pg_temp.cnt($q$select 1 from public.on_hand_supplies where name = 'supply:P2'$q$) = 1
      and pg_temp.cnt($q$select 1 from public.project_shares where token = 'tok-P2'$q$) = 1
      and pg_temp.cnt($q$select 1 from public.attachments where name = 'attach:P2'$q$) = 1
      and pg_temp.cnt($q$select 1 from public.reminders where value = 'reminder:P2'$q$) = 1
      and pg_temp.cnt(format($q$select 1 from public.task_tags where task_id = %L$q$, md5('task:P2')::uuid)) = 1
      and pg_temp.cnt(format($q$select 1 from public.task_sections where task_id = %L$q$, md5('task:P2')::uuid)) = 1);
    perform pg_temp.ok(u || ' sees P2 plans via project/goal/section but not org-A-only plan',
      pg_temp.cnt($q$select 1 from public.plans where name in ('plan-proj:P2','plan-goal:P2','plan-section:P2')$q$) = 3
      and pg_temp.cnt($q$select 1 from public.plans where name = 'plan-org:A'$q$) = (case when u = 'both' then 1 else 0 end));
    perform pg_temp.ok(u || ' sees project events for P2 only',
      pg_temp.cnt(format($q$select 1 from public.entity_events where project_id = %L$q$, md5('P2')::uuid)) > 0
      and pg_temp.cnt(format($q$select 1 from public.entity_events where project_id = %L$q$, md5('P1')::uuid)) = (case when u = 'both' then pg_temp.cnt(format($q$select 1 from public.entity_events where project_id = %L$q$, md5('P1')::uuid)) else 0 end));
    perform pg_temp.ok(u || ' sees no P1 tasks unless also in A',
      pg_temp.cnt($q$select 1 from public.tasks where name = 'task:P1'$q$) = (case when u = 'both' then 1 else 0 end));
    perform pg_temp.ok(u || ' sees no P3',
      pg_temp.cnt($q$select 1 from public.projects where name = 'P3'$q$) = 0);
  end loop;

  perform pg_temp.become('memB');
  perform pg_temp.ok('memB (plain member of client org) can write inside P2',
    pg_temp.dml(format($q$insert into public.sections (name, project_id) values ('b-section', %L)$q$, md5('P2')::uuid)) = 1
    and pg_temp.dml(format($q$insert into public.tasks (name, project_id) values ('b-task', %L)$q$, md5('P2')::uuid)) = 1
    and pg_temp.dml(format($q$insert into public.goals (name, project_id) values ('b-goal', %L)$q$, md5('P2')::uuid)) = 1
    and pg_temp.dml(format($q$insert into public.plans (name, project_id) values ('b-plan', %L)$q$, md5('P2')::uuid)) = 1
    and pg_temp.dml($q$update public.projects set description = 'edited by B' where name = 'P2'$q$) = 1
    and pg_temp.dml($q$update public.tasks set description = 'b' where name = 'task:P2'$q$) = 1);
  perform pg_temp.ok('memB cannot write into P1 (not shared)',
    pg_temp.dml(format($q$insert into public.sections (name, project_id) values ('x', %L)$q$, md5('P1')::uuid)) = -1
    and pg_temp.dml($q$update public.tasks set description = 'b' where name = 'task:P1'$q$) = 0);
  perform pg_temp.ok('memB cannot create a project in org A (INSERT still checks the PRIMARY org membership)',
    pg_temp.dml(format($q$insert into public.projects (name, organization_id) values ('evil', %L)$q$, md5('org:A')::uuid)) = -1);
  perform pg_temp.ok('memB CAN create a project in its own org B',
    pg_temp.dml(format($q$insert into public.projects (name, organization_id) values ('b-own', %L)$q$, md5('org:B')::uuid)) = 1);
  perform pg_temp.ok('memB cannot add/remove orgs', 
    pg_temp.dml(format($q$delete from public.project_organizations where project_id = %L and not is_primary$q$, md5('P2')::uuid)) = 0
    and pg_temp.dml(format($q$insert into public.project_organizations (project_id, organization_id) values (%L, %L)$q$, md5('P2')::uuid, md5('org:C')::uuid)) = -1);
  perform pg_temp.ok('memB can read the project org list of P2 (both orgs)',
    pg_temp.cnt(format($q$select 1 from public.project_organizations where project_id = %L$q$, md5('P2')::uuid)) = 2);
  perform pg_temp.ok('ownC cannot read the org list of P2',
    (select pg_temp.become('ownC') is not null) and pg_temp.cnt(format($q$select 1 from public.project_organizations where project_id = %L$q$, md5('P2')::uuid)) = 0);
  perform pg_temp.become('none');
  perform pg_temp.ok('user with no org sees nothing', pg_temp.cnt($q$select 1 from public.projects$q$) = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Project administration (user_projects) and role = manager vs member
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.become('ownB');
  perform pg_temp.ok('client-org OWNER (role manager) can manage user_projects on P2',
    pg_temp.dml(format($q$insert into public.user_projects (user_id, project_id) values (%L, %L)$q$, md5('u:memB')::uuid, md5('P2')::uuid)) = 1);
  perform pg_temp.ok('client-org owner cannot manage user_projects on P1',
    pg_temp.dml(format($q$insert into public.user_projects (user_id, project_id) values (%L, %L)$q$, md5('u:memB')::uuid, md5('P1')::uuid)) = -1);
  perform pg_temp.ok('client-org owner sees P2 memberships',
    pg_temp.cnt(format($q$select 1 from public.user_projects where project_id = %L$q$, md5('P2')::uuid)) >= 2);
  perform pg_temp.become('memB');
  perform pg_temp.ok('plain client member cannot manage user_projects',
    pg_temp.dml(format($q$insert into public.user_projects (user_id, project_id) values (%L, %L)$q$, md5('u:none')::uuid, md5('P2')::uuid)) = -1);
  perform pg_temp.ok('is_project_org_admin: ownB true, memB false, ownA true, ownC false',
    (select pg_temp.become('ownB') is not null) and public.is_project_org_admin(md5('P2')::uuid)
    and (select pg_temp.become('memB') is not null) and not public.is_project_org_admin(md5('P2')::uuid)
    and (select pg_temp.become('ownA') is not null) and public.is_project_org_admin(md5('P2')::uuid)
    and (select pg_temp.become('ownC') is not null) and not public.is_project_org_admin(md5('P2')::uuid));

  -- downgrade B's link to role = member: data access unchanged, project-admin gone
  perform pg_temp.become('ownA');
  perform pg_temp.ok('primary owner can downgrade link role to member',
    pg_temp.dml(format($q$update public.project_organizations set role = 'member' where project_id = %L and organization_id = %L$q$, md5('P2')::uuid, md5('org:B')::uuid)) = 1);
  perform pg_temp.become('ownB');
  perform pg_temp.ok('role=member: client owner loses project-admin',
    not public.is_project_org_admin(md5('P2')::uuid));
  perform pg_temp.ok('role=member: client owner keeps work access',
    pg_temp.cnt($q$select 1 from public.tasks where name = 'task:P2'$q$) = 1);
  perform pg_temp.become('ownA');
  perform pg_temp.dml(format($q$update public.project_organizations set role = 'manager' where project_id = %L and organization_id = %L$q$, md5('P2')::uuid, md5('org:B')::uuid));
end $$;

-- ---------------------------------------------------------------------------
-- 6. The primary org cannot be hijacked from a shared project
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.become('memB');
  perform pg_temp.ok('memB cannot re-point P2 to org B (hijack blocked by guard trigger)',
    pg_temp.dml(format($q$update public.projects set organization_id = %L where name = 'P2'$q$, md5('org:B')::uuid)) = -1);
  perform pg_temp.become('ownB');
  perform pg_temp.ok('client org OWNER cannot re-point P2 either (only old-primary admins)',
    pg_temp.dml(format($q$update public.projects set organization_id = %L where name = 'P2'$q$, md5('org:B')::uuid)) = -1);
  perform pg_temp.become('both');
  perform pg_temp.ok('plain member in both orgs cannot re-point P2',
    pg_temp.dml(format($q$update public.projects set organization_id = %L where name = 'P2'$q$, md5('org:B')::uuid)) = -1);
  perform pg_temp.become('ownA');
  perform pg_temp.ok('primary org cannot hand P2 to an org it is not a member of',
    pg_temp.dml(format($q$update public.projects set organization_id = %L where name = 'P2'$q$, md5('org:C')::uuid)) in (-1, 0));
  perform pg_temp.ok('after all attempts P2 still has primary A and both links',
    (select organization_id from public.projects where name = 'P2') = md5('org:A')::uuid
    and (select count(*) from public.project_organizations where project_id = md5('P2')::uuid) = 2);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Helper functions
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.become('memB');
  perform pg_temp.ok('project_org_ids as memB returns both orgs',
    (select count(*) from public.project_org_ids(md5('P2')::uuid)) = 2);
  perform pg_temp.ok('project_org_ids as memB returns nothing for P1',
    (select count(*) from public.project_org_ids(md5('P1')::uuid)) = 0);
  perform pg_temp.become('none');
  perform pg_temp.ok('project_org_ids as org-less user returns nothing',
    (select count(*) from public.project_org_ids(md5('P2')::uuid)) = 0);
  perform pg_temp.become(null);
  perform pg_temp.ok('project_org_ids without a user (service context) returns both orgs',
    (select count(*) from public.project_org_ids(md5('P2')::uuid)) = 2);
  perform pg_temp.become('superu');
  perform pg_temp.ok('super admin has access to any project via helper',
    public.user_has_project_org_access(md5('P3')::uuid) and not public.user_belongs_to_project_org(md5('P3')::uuid));
  perform pg_temp.become('memA');
  perform pg_temp.ok('helpers answer false for nonexistent project',
    not public.user_has_project_org_access(md5('nope')::uuid));
  reset role;
  perform pg_temp.ok('anon cannot execute the new helpers',
    not has_function_privilege('anon', 'public.user_has_project_org_access(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.user_belongs_to_project_org(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.project_org_ids(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.is_project_org_admin(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.is_project_primary_org_admin(uuid)', 'execute'));
  perform pg_temp.ok('anon has no table privileges on project_organizations',
    not has_table_privilege('anon', 'public.project_organizations', 'select'));
end $$;

-- ---------------------------------------------------------------------------
-- 8. Un-sharing removes access immediately
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.become('ownB');
  perform pg_temp.ok('client owner cannot unshare (only primary-org admins remove orgs)',
    pg_temp.dml(format($q$delete from public.project_organizations where project_id = %L and organization_id = %L$q$, md5('P2')::uuid, md5('org:B')::uuid)) = 0);
  perform pg_temp.become('ownA');
  perform pg_temp.ok('primary owner can unshare',
    pg_temp.dml(format($q$delete from public.project_organizations where project_id = %L and organization_id = %L$q$, md5('P2')::uuid, md5('org:B')::uuid)) = 1);
  perform pg_temp.become('memB');
  perform pg_temp.ok('memB loses P2 and all its children the moment it is unshared',
    pg_temp.cnt($q$select 1 from public.projects where name = 'P2'$q$) = 0
    and pg_temp.cnt($q$select 1 from public.tasks where name = 'task:P2'$q$) = 0
    and pg_temp.cnt($q$select 1 from public.sections where name = 'section:P2'$q$) = 0
    and pg_temp.cnt($q$select 1 from public.plans where name = 'plan-proj:P2'$q$) = 0);
  perform pg_temp.become('ownA');
  perform pg_temp.dml(format($q$insert into public.project_organizations (project_id, organization_id) values (%L, %L)$q$, md5('P2')::uuid, md5('org:B')::uuid));
end $$;

-- ---------------------------------------------------------------------------
-- 9. Primary-org move (service context) keeps the join table in sync
-- ---------------------------------------------------------------------------
do $$ begin
  reset role;
  update public.projects set organization_id = md5('org:C')::uuid where name = 'P1';
  perform pg_temp.ok('moving an unshared project replaces its primary link (old org loses access)',
    (select count(*) from public.project_organizations where project_id = md5('P1')::uuid) = 1
    and exists (select 1 from public.project_organizations where project_id = md5('P1')::uuid and organization_id = md5('org:C')::uuid and is_primary));
  update public.projects set organization_id = md5('org:A')::uuid where name = 'P1';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Soft-deleting org A keeps the shared project alive (soft_delete_entity)
-- ---------------------------------------------------------------------------
do $$ declare b uuid; begin
  reset role;
  b := public.soft_delete_entity('organization', md5('org:A')::uuid);
  perform pg_temp.ok('soft-delete of org A soft-deletes unshared P1',
    (select deleted_at is not null from public.projects where name = 'P1'));
  perform pg_temp.ok('soft-delete of org A does NOT soft-delete shared P2',
    (select deleted_at is null from public.projects where name = 'P2'));
  perform public.restore_entity(b);
  perform pg_temp.ok('restore brings P1 back', (select deleted_at is null from public.projects where name = 'P1'));
end $$;

-- ---------------------------------------------------------------------------
-- 11. HARD-deleting org A hands the shared project to B instead of deleting it
-- ---------------------------------------------------------------------------
do $$ begin
  reset role;
  delete from public.organizations where id = md5('org:A')::uuid;
  perform pg_temp.ok('shared P2 survives hard deletion of its primary org',
    exists (select 1 from public.projects where name = 'P2'));
  perform pg_temp.ok('P2 primary org was reassigned to B',
    (select organization_id from public.projects where name = 'P2') = md5('org:B')::uuid
    and exists (select 1 from public.project_organizations where project_id = md5('P2')::uuid and organization_id = md5('org:B')::uuid and is_primary)
    and (select count(*) from public.project_organizations where project_id = md5('P2')::uuid) = 1);
  perform pg_temp.ok('P2 children survive', exists (select 1 from public.tasks where name = 'task:P2') and exists (select 1 from public.sections where name = 'section:P2'));
  perform pg_temp.ok('unshared P1 is still cascaded away exactly as before',
    not exists (select 1 from public.projects where name = 'P1'));
  perform pg_temp.become('memB');
  perform pg_temp.ok('memB still sees P2 afterwards', pg_temp.cnt($q$select 1 from public.projects where name = 'P2'$q$) = 1);
end $$;

rollback;
\echo ALL ASSERTIONS PASSED

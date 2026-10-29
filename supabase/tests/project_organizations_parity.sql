-- Behavioural parity snapshot. Run against the schema BEFORE and AFTER the
-- multi-org migrations; the two outputs must be byte-identical (nothing is
-- shared yet, so every rewritten policy must answer exactly as it did).
-- Driven by scripts/test-project-orgs-rls.sh (run from the web/ directory).
\set ON_ERROR_STOP on
begin;
\i supabase/tests/project_organizations_seed.sql

-- Supabase grants this by default; the scratch DB needs it for role `authenticated`.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated; -- prod has explicit authenticated grants

create temp table _snap (u text, t text, labels text);
grant all on _snap to authenticated;
create temp table _w (u text, t text, ok boolean);
grant all on _w to authenticated;

create or replace function pg_temp.snap(p_user text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', md5('u:' || p_user)::uuid::text, true);
  set local role authenticated;
  insert into _snap select p_user, 'projects',          coalesce(string_agg(name, ',' order by name), '') from public.projects;
  insert into _snap select p_user, 'user_projects',     coalesce(string_agg(project_id::text || ':' || user_id::text, ',' order by project_id::text, user_id::text), '') from public.user_projects;
  insert into _snap select p_user, 'tasks',             coalesce(string_agg(name, ',' order by name), '') from public.tasks;
  insert into _snap select p_user, 'sections',          coalesce(string_agg(name, ',' order by name), '') from public.sections;
  insert into _snap select p_user, 'goals',             coalesce(string_agg(name, ',' order by name), '') from public.goals;
  insert into _snap select p_user, 'comments',          coalesce(string_agg(content, ',' order by content), '') from public.comments;
  insert into _snap select p_user, 'on_hand_supplies',  coalesce(string_agg(name, ',' order by name), '') from public.on_hand_supplies;
  insert into _snap select p_user, 'plans',             coalesce(string_agg(name, ',' order by name), '') from public.plans;
  insert into _snap select p_user, 'project_shares',    coalesce(string_agg(token, ',' order by token), '') from public.project_shares;
  insert into _snap select p_user, 'attachments',       coalesce(string_agg(name, ',' order by name), '') from public.attachments;
  insert into _snap select p_user, 'reminders',         coalesce(string_agg(value, ',' order by value), '') from public.reminders;
  insert into _snap select p_user, 'task_tags',         coalesce(string_agg(tag_id::text, ',' order by tag_id::text), '') from public.task_tags;
  insert into _snap select p_user, 'task_sections',     coalesce(string_agg(section_id::text, ',' order by section_id::text), '') from public.task_sections;
  insert into _snap select p_user, 'entity_events',     coalesce(string_agg(distinct (entity_type || ':' || operation), ',' order by (entity_type || ':' || operation)), '') from public.entity_events;
  insert into _snap select p_user, 'entity_events_n',   count(*)::text from public.entity_events;
  reset role;
end $f$;

select pg_temp.snap(u) from unnest(array['ownA','memA','ownB','memB','ownC','both','none','superu','gadmin']) u;

-- write-side parity
create or replace function pg_temp.writes(p_user text) returns void language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', md5('u:' || p_user)::uuid::text, true);
  set local role authenticated;
  begin
    update public.projects set description = 'x' where name = 'P1';
    get diagnostics n = row_count; insert into _w values (p_user, 'update P1', n = 1);
  exception when others then insert into _w values (p_user, 'update P1', false); end;
  begin
    update public.projects set description = 'x' where name = 'P3';
    get diagnostics n = row_count; insert into _w values (p_user, 'update P3', n = 1);
  exception when others then insert into _w values (p_user, 'update P3', false); end;
  begin
    insert into public.sections (name, project_id) values ('new', md5('P1')::uuid);
    insert into _w values (p_user, 'insert section P1', true);
  exception when others then insert into _w values (p_user, 'insert section P1', false); end;
  begin
    insert into public.goals (name, project_id) values ('new', md5('P3')::uuid);
    insert into _w values (p_user, 'insert goal P3', true);
  exception when others then insert into _w values (p_user, 'insert goal P3', false); end;
  begin
    insert into public.projects (name, organization_id) values ('newA', md5('org:A')::uuid);
    insert into _w values (p_user, 'insert project in A', true);
  exception when others then insert into _w values (p_user, 'insert project in A', false); end;
  begin
    insert into public.user_projects (user_id, project_id) values (md5('u:none')::uuid, md5('P1')::uuid);
    insert into _w values (p_user, 'insert user_projects P1', true);
  exception when others then insert into _w values (p_user, 'insert user_projects P1', false); end;
  begin
    update public.projects set organization_id = md5('org:B')::uuid where name = 'P1';
    get diagnostics n = row_count;
    insert into _w values (p_user, 'move P1 to B', n = 1);
  exception when others then insert into _w values (p_user, 'move P1 to B', false); end;
  reset role;
end $f$;
select pg_temp.writes(u) from unnest(array['ownA','memA','ownB','memB','ownC','both','none','superu','gadmin']) u;

\echo SNAPSHOT
select u || ' | ' || t || ' | ' || labels from _snap order by u, t;
select u || ' | W | ' || t || ' | ' || ok from _w order by u, t;
rollback;

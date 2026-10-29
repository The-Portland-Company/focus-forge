-- Shared fixture for the multi-org project RLS tests. Run INSIDE a transaction
-- (callers `begin; \i seed; ... rollback;`) as a role that bypasses RLS.
-- Every id is md5(label)::uuid so output is stable across databases.
--
--   users:  ownA memA ownB memB ownC both(A+B) none superu(super_admin) gadmin(profiles.role=admin)
--   orgs:   A (The Portland Company) B (client) C (unrelated)
--   projects: P1 (A, never shared)  P2 (A, shared with B by the test)  P3 (C)

create or replace function pg_temp.id(label text) returns uuid language sql immutable as
$$ select md5(label)::uuid $$;

-- The scratch schema is rebuilt from repo migrations only (the pre-repo base
-- schema is absent), so tasks lacks a column the outbox trigger reads. The
-- trigger is unrelated to authorization; silence it inside this transaction.
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'sync_outbox_task' and tgrelid = 'public.tasks'::regclass) then
    alter table public.tasks disable trigger sync_outbox_task;
  end if;
end $$;

insert into auth.users (id, email)
select pg_temp.id('u:' || n), n || '@example.test'
from unnest(array['ownA','memA','ownB','memB','ownC','both','none','superu','gadmin']) n;

-- handle_new_user creates the profiles; make sure they exist either way.
insert into public.profiles (id, email)
select pg_temp.id('u:' || n), n || '@example.test'
from unnest(array['ownA','memA','ownB','memB','ownC','both','none','superu','gadmin']) n
on conflict (id) do nothing;
update public.profiles set role = 'super_admin' where id = pg_temp.id('u:superu');
update public.profiles set role = 'admin'       where id = pg_temp.id('u:gadmin');

insert into public.organizations (id, name)
values (pg_temp.id('org:A'), 'Org A'), (pg_temp.id('org:B'), 'Org B'), (pg_temp.id('org:C'), 'Org C');

insert into public.user_organizations (user_id, organization_id, is_owner) values
  (pg_temp.id('u:ownA'), pg_temp.id('org:A'), true),
  (pg_temp.id('u:memA'), pg_temp.id('org:A'), false),
  (pg_temp.id('u:ownB'), pg_temp.id('org:B'), true),
  (pg_temp.id('u:memB'), pg_temp.id('org:B'), false),
  (pg_temp.id('u:ownC'), pg_temp.id('org:C'), true),
  (pg_temp.id('u:both'), pg_temp.id('org:A'), false),
  (pg_temp.id('u:both'), pg_temp.id('org:B'), false);

insert into public.projects (id, name, organization_id) values
  (pg_temp.id('P1'), 'P1', pg_temp.id('org:A')),
  (pg_temp.id('P2'), 'P2', pg_temp.id('org:A')),
  (pg_temp.id('P3'), 'P3', pg_temp.id('org:C'));

-- one of each child row per project
insert into public.sections (id, name, project_id)
select pg_temp.id('section:' || p), 'section:' || p, pg_temp.id(p) from unnest(array['P1','P2','P3']) p;
insert into public.goals (id, name, project_id)
select pg_temp.id('goal:' || p), 'goal:' || p, pg_temp.id(p) from unnest(array['P1','P2','P3']) p;
insert into public.tasks (id, name, project_id)
select pg_temp.id('task:' || p), 'task:' || p, pg_temp.id(p) from unnest(array['P1','P2','P3']) p;
insert into public.comments (id, content, task_id)
select pg_temp.id('comment-task:' || p), 'comment-task:' || p, pg_temp.id('task:' || p) from unnest(array['P1','P2','P3']) p;
insert into public.comments (id, content, project_id)
select pg_temp.id('comment-proj:' || p), 'comment-proj:' || p, pg_temp.id(p) from unnest(array['P1','P2','P3']) p;
insert into public.on_hand_supplies (id, name, project_id)
select pg_temp.id('supply:' || p), 'supply:' || p, pg_temp.id(p) from unnest(array['P1','P2','P3']) p;
insert into public.plans (id, name, project_id)
select pg_temp.id('plan-proj:' || p), 'plan-proj:' || p, pg_temp.id(p) from unnest(array['P1','P2','P3']) p;
insert into public.plans (id, name, goal_id)
select pg_temp.id('plan-goal:' || p), 'plan-goal:' || p, pg_temp.id('goal:' || p) from unnest(array['P1','P2','P3']) p;
insert into public.plans (id, name, section_id)
select pg_temp.id('plan-section:' || p), 'plan-section:' || p, pg_temp.id('section:' || p) from unnest(array['P1','P2','P3']) p;
insert into public.plans (id, name, organization_id)
values (pg_temp.id('plan-org:A'), 'plan-org:A', pg_temp.id('org:A')),
       (pg_temp.id('plan-org:C'), 'plan-org:C', pg_temp.id('org:C'));
insert into public.project_shares (id, project_id, token)
select pg_temp.id('share:' || p), pg_temp.id(p), 'tok-' || p from unnest(array['P1','P2','P3']) p;
insert into public.attachments (id, task_id, name, url, type)
select pg_temp.id('attach:' || p), pg_temp.id('task:' || p), 'attach:' || p, 'http://x', 'file' from unnest(array['P1','P2','P3']) p;
insert into public.reminders (id, task_id, type, value)
select pg_temp.id('reminder:' || p), pg_temp.id('task:' || p), 'custom', 'reminder:' || p from unnest(array['P1','P2','P3']) p;
insert into public.tags (id, name)
select pg_temp.id('tag:' || p), 'tag:' || p from unnest(array['P1','P2','P3']) p;
insert into public.task_tags (task_id, tag_id)
select pg_temp.id('task:' || p), pg_temp.id('tag:' || p) from unnest(array['P1','P2','P3']) p;
insert into public.task_sections (id, task_id, section_id)
select pg_temp.id('tasksec:' || p), pg_temp.id('task:' || p), pg_temp.id('section:' || p) from unnest(array['P1','P2','P3']) p;
insert into public.user_projects (user_id, project_id, is_owner) values
  (pg_temp.id('u:ownA'), pg_temp.id('P1'), true),
  (pg_temp.id('u:ownA'), pg_temp.id('P2'), true),
  (pg_temp.id('u:ownC'), pg_temp.id('P3'), true);

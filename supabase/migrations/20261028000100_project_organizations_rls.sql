-- Multi-organization project ownership, step B of 2: RLS rewrite.
--
-- Every policy that derived access from a project's single owning org
-- (projects.organization_id, via user_has_organization_access(p.organization_id)
-- or an inline "projects JOIN user_organizations" subquery) now derives it from
-- the project's full org set:
--   user_has_organization_access(p.organization_id) -> user_has_project_org_access(p.id)   (includes super admin, as before)
--   inline projects/user_organizations join         -> user_belongs_to_project_org(...)    (membership only, NO super admin, as before)
--
-- ALTER POLICY is used throughout so each policy keeps its name, command and
-- role list; only the USING / WITH CHECK expression changes. Each table is its
-- own savepoint-free block inside ONE transaction: if any statement fails the
-- whole migration rolls back and no policy is left half-converted.
--
-- Deliberately NOT changed:
--   * projects INSERT / "Admins can manage projects in their organizations"
--     (WITH CHECK stays user_has_organization_access(organization_id): you can
--     only create a project in a PRIMARY org you belong to).
--   * policies keyed on a table's OWN organization_id column (plans.organization_id
--     branch, stakes, audit_logs, contacts, email_*, time_tracking; task_reorg_* keep
--     their org branch and only gain an additive project branch):
--     those rows belong to one org by design, not to a project's org set.
--
-- With only primary links present, every rewritten policy is logically
-- identical to its predecessor (verified by supabase/tests/project_organizations_rls.test.sql).
--
-- Rollback: supabase/rollbacks/20261028000100_project_organizations_rls_down.sql

begin;

-- Fail fast if step A was not applied.
do $$
begin
  if to_regprocedure('public.user_has_project_org_access(uuid)') is null
     or to_regprocedure('public.user_belongs_to_project_org(uuid)') is null
     or to_regclass('public.project_organizations') is null then
    raise exception 'apply 20261028000000_project_organizations.sql first';
  end if;
end $$;

-- ---------------------------------------------------------------- projects
alter policy "Users can view projects in their organizations" on public.projects
  using (public.user_has_project_org_access(id));

-- WITH CHECK is explicit. Before, the implicit check was "the NEW primary org is
-- one the caller belongs to". A member of a SHARED (non-primary) org editing the
-- project leaves organization_id unchanged (= an org they do not belong to), so
-- the new check is: access to the row AND the new primary org is either one the
-- caller belongs to OR already linked to this project (i.e. unchanged / an
-- existing co-owner). Re-pointing at any other org is still rejected, and for
-- shared projects the guard trigger additionally restricts who may change it.
alter policy "Team members can update projects in their organizations" on public.projects
  using (public.user_has_project_org_access(id))
  with check (
    public.user_has_project_org_access(id)
    and (
      public.user_has_organization_access(organization_id)
      or exists (
        select 1 from public.project_organizations po
        where po.project_id = projects.id
          and po.organization_id = projects.organization_id
      )
    )
  );

-- ------------------------------------------------------------ user_projects
alter policy "Users can view project memberships" on public.user_projects
  using (
    auth.uid() = user_id
    or public.is_super_admin()
    or exists (
      select 1 from public.projects p
      where p.id = user_projects.project_id
        and public.user_has_project_org_access(p.id)
    )
  );

alter policy "Org admins can manage project memberships" on public.user_projects
  using (
    exists (
      select 1 from public.projects p
      where p.id = user_projects.project_id
        and public.is_project_org_admin(p.id)
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = user_projects.project_id
        and public.is_project_org_admin(p.id)
    )
  );

-- ------------------------------------------------------------------- tasks
alter policy "Users can manage tasks in their projects" on public.tasks
  using (exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and public.user_has_project_org_access(p.id)));

alter policy "Users can view tasks in their projects" on public.tasks
  using (exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and public.user_has_project_org_access(p.id)));

-- --------------------------------------- task children (tasks JOIN projects)
alter policy "Users can manage attachments for their tasks" on public.attachments
  using (exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = attachments.task_id and public.user_has_project_org_access(p.id)));

alter policy "Users can view attachments for their tasks" on public.attachments
  using (exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = attachments.task_id and public.user_has_project_org_access(p.id)));

alter policy "Users can manage reminders for their tasks" on public.reminders
  using (exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = reminders.task_id and public.user_has_project_org_access(p.id)));

alter policy "Users can view reminders for their tasks" on public.reminders
  using (exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = reminders.task_id and public.user_has_project_org_access(p.id)));

alter policy "Users can manage task tags for their tasks" on public.task_tags
  using (exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = task_tags.task_id and public.user_has_project_org_access(p.id)));

alter policy "Users can view task tags for their tasks" on public.task_tags
  using (exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = task_tags.task_id and public.user_has_project_org_access(p.id)));

alter policy "Users can manage task sections in their projects" on public.task_sections
  using (task_id is not null and exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = task_sections.task_id and public.user_has_project_org_access(p.id)))
  with check (task_id is not null and exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = task_sections.task_id and public.user_has_project_org_access(p.id)));

alter policy "Users can view task sections in their projects" on public.task_sections
  using (task_id is not null and exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = task_sections.task_id and public.user_has_project_org_access(p.id)));

-- ---------------------------------------------------------------- comments
alter policy "Users can manage comments on their tasks" on public.comments
  using (
    (task_id is not null and exists (
       select 1 from public.tasks t join public.projects p on p.id = t.project_id
       where t.id = comments.task_id and public.user_has_project_org_access(p.id)))
    or
    (project_id is not null and exists (
       select 1 from public.projects p
       where p.id = comments.project_id and public.user_has_project_org_access(p.id)))
  );

alter policy "Users can view comments on their tasks" on public.comments
  using (
    (task_id is not null and exists (
       select 1 from public.tasks t join public.projects p on p.id = t.project_id
       where t.id = comments.task_id and public.user_has_project_org_access(p.id)))
    or
    (project_id is not null and exists (
       select 1 from public.projects p
       where p.id = comments.project_id and public.user_has_project_org_access(p.id)))
  );

-- inline-join policy: membership only (no super admin), as before
alter policy "Users can view comments in their organizations" on public.comments
  using (
    task_id in (
      select t.id from public.tasks t
      where public.user_belongs_to_project_org(t.project_id))
    or project_id in (
      select p.id from public.projects p
      where public.user_belongs_to_project_org(p.id))
  );

-- ---------------------------------------------------------------- sections
alter policy "Users can manage sections in their projects" on public.sections
  using (exists (
    select 1 from public.projects p
    where p.id = sections.project_id and public.user_has_project_org_access(p.id)));

alter policy "Users can create sections in their projects" on public.sections
  with check (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can delete sections in their projects" on public.sections
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can update sections in their projects" on public.sections
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can view sections in their projects" on public.sections
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

-- ------------------------------------------------------------------- goals
alter policy "Users can create goals in their projects" on public.goals
  with check (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can delete goals in their projects" on public.goals
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can update goals in their projects" on public.goals
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can view goals in their projects" on public.goals
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

-- --------------------------------------------------------- on_hand_supplies
alter policy "Users can delete on-hand supplies in their projects" on public.on_hand_supplies
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can insert on-hand supplies in their projects" on public.on_hand_supplies
  with check (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can update on-hand supplies in their projects" on public.on_hand_supplies
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

alter policy "Users can view on-hand supplies in their projects" on public.on_hand_supplies
  using (project_id in (
    select p.id from public.projects p where public.user_belongs_to_project_org(p.id)));

-- ------------------------------------------------------------------- plans
-- plans.organization_id is the plan's OWN org (kept as-is). Only the
-- project / goal / section branches follow the project's org set.
alter policy "Users can view plans in their orgs" on public.plans
  using (
    organization_id in (select uo.organization_id from public.user_organizations uo
                        where uo.user_id = (select auth.uid()))
    or project_id in (select p.id from public.projects p
                      where public.user_belongs_to_project_org(p.id))
    or goal_id in (select g.id from public.goals g
                   where public.user_belongs_to_project_org(g.project_id))
    or section_id in (select s.id from public.sections s
                      where public.user_belongs_to_project_org(s.project_id))
  );

alter policy "Users can update plans in their orgs" on public.plans
  using (
    organization_id in (select uo.organization_id from public.user_organizations uo
                        where uo.user_id = (select auth.uid()))
    or project_id in (select p.id from public.projects p
                      where public.user_belongs_to_project_org(p.id))
    or goal_id in (select g.id from public.goals g
                   where public.user_belongs_to_project_org(g.project_id))
    or section_id in (select s.id from public.sections s
                      where public.user_belongs_to_project_org(s.project_id))
  );

alter policy "Users can delete plans in their orgs" on public.plans
  using (
    organization_id in (select uo.organization_id from public.user_organizations uo
                        where uo.user_id = (select auth.uid()))
    or project_id in (select p.id from public.projects p
                      where public.user_belongs_to_project_org(p.id))
    or goal_id in (select g.id from public.goals g
                   where public.user_belongs_to_project_org(g.project_id))
    or section_id in (select s.id from public.sections s
                      where public.user_belongs_to_project_org(s.project_id))
  );

alter policy "Users can create plans in their orgs" on public.plans
  with check (
    organization_id in (select uo.organization_id from public.user_organizations uo
                        where uo.user_id = (select auth.uid()))
    or project_id in (select p.id from public.projects p
                      where public.user_belongs_to_project_org(p.id))
    or goal_id in (select g.id from public.goals g
                   where public.user_belongs_to_project_org(g.project_id))
    or section_id in (select s.id from public.sections s
                      where public.user_belongs_to_project_org(s.project_id))
  );

-- junction: project_shares
alter policy "project_shares_member_all" on public.project_shares
  using (
    exists (select 1 from public.user_projects up
            where up.project_id = project_shares.project_id and up.user_id = auth.uid())
    or public.user_belongs_to_project_org(project_shares.project_id)
  )
  with check (
    exists (select 1 from public.user_projects up
            where up.project_id = project_shares.project_id and up.user_id = auth.uid())
    or public.user_belongs_to_project_org(project_shares.project_id)
  );

-- ------------------------------------------------------- task_reorg_batches/moves
-- Batches are stamped with the project's PRIMARY org. A manager of a shared org
-- passes the app-level project-admin check, so batches must also be reachable
-- through the batch's project (additive OR; the org-column branch is unchanged).
alter policy "Members can view reorg batches" on public.task_reorg_batches
  using (
    organization_id in (select uo.organization_id from public.user_organizations uo
                        where uo.user_id = (select auth.uid()))
    or (project_id is not null and public.user_belongs_to_project_org(project_id))
  );

alter policy "Members can create reorg batches" on public.task_reorg_batches
  with check (
    organization_id in (select uo.organization_id from public.user_organizations uo
                        where uo.user_id = (select auth.uid()))
    or (project_id is not null and public.user_belongs_to_project_org(project_id))
  );

alter policy "Members can update reorg batches" on public.task_reorg_batches
  using (
    organization_id in (select uo.organization_id from public.user_organizations uo
                        where uo.user_id = (select auth.uid()))
    or (project_id is not null and public.user_belongs_to_project_org(project_id))
  );

alter policy "Members can view reorg moves" on public.task_reorg_moves
  using (batch_id in (
    select b.id from public.task_reorg_batches b
    where b.organization_id in (select uo.organization_id from public.user_organizations uo
                                where uo.user_id = (select auth.uid()))
       or (b.project_id is not null and public.user_belongs_to_project_org(b.project_id))
  ));

alter policy "Members can create reorg moves" on public.task_reorg_moves
  with check (batch_id in (
    select b.id from public.task_reorg_batches b
    where b.organization_id in (select uo.organization_id from public.user_organizations uo
                                where uo.user_id = (select auth.uid()))
       or (b.project_id is not null and public.user_belongs_to_project_org(b.project_id))
  ));

alter policy "Members can update reorg moves" on public.task_reorg_moves
  using (batch_id in (
    select b.id from public.task_reorg_batches b
    where b.organization_id in (select uo.organization_id from public.user_organizations uo
                                where uo.user_id = (select auth.uid()))
       or (b.project_id is not null and public.user_belongs_to_project_org(b.project_id))
  ));

-- ------------------------------------------------------------ entity_events
-- Events carry the PRIMARY org in organization_id; shared-org members also see
-- the events of projects they can access.
alter policy "Users can view entity events in their organizations" on public.entity_events
  using (
    public.user_has_organization_access(organization_id)
    or public.is_super_admin()
    or (project_id is not null and public.user_has_project_org_access(project_id))
  );

commit;

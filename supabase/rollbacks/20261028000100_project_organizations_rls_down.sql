-- Restores every policy rewritten by 20261028000100_project_organizations_rls.sql to the
-- expression it had before (captured from pg_policies on the migration-replayed schema).
-- Run BEFORE 20261028000000_project_organizations_down.sql.

begin;

alter policy "Users can view projects in their organizations" on public.projects
  using (user_has_organization_access(organization_id));

-- ALTER POLICY cannot remove a WITH CHECK, so this one is dropped and recreated
-- (original: FOR UPDATE, role PUBLIC, USING only; implicit WITH CHECK = USING).
drop policy "Team members can update projects in their organizations" on public.projects;
create policy "Team members can update projects in their organizations" on public.projects
  for update
  using (user_has_organization_access(organization_id));

alter policy "Users can view project memberships" on public.user_projects
  using (((auth.uid() = user_id) OR is_super_admin() OR (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = user_projects.project_id) AND user_has_organization_access(p.organization_id))))));

alter policy "Org admins can manage project memberships" on public.user_projects
  using ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = user_projects.project_id) AND is_org_admin(auth.uid(), p.organization_id)))))
  with check ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = user_projects.project_id) AND is_org_admin(auth.uid(), p.organization_id)))));

alter policy "Users can manage tasks in their projects" on public.tasks
  using ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = tasks.project_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can view tasks in their projects" on public.tasks
  using ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = tasks.project_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can manage attachments for their tasks" on public.attachments
  using ((EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = attachments.task_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can view attachments for their tasks" on public.attachments
  using ((EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = attachments.task_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can manage reminders for their tasks" on public.reminders
  using ((EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = reminders.task_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can view reminders for their tasks" on public.reminders
  using ((EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = reminders.task_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can manage task tags for their tasks" on public.task_tags
  using ((EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = task_tags.task_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can view task tags for their tasks" on public.task_tags
  using ((EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = task_tags.task_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can manage task sections in their projects" on public.task_sections
  using (((task_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = task_sections.task_id) AND user_has_organization_access(p.organization_id))))))
  with check (((task_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = task_sections.task_id) AND user_has_organization_access(p.organization_id))))));

alter policy "Users can view task sections in their projects" on public.task_sections
  using (((task_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = task_sections.task_id) AND user_has_organization_access(p.organization_id))))));

alter policy "Users can manage comments on their tasks" on public.comments
  using ((((task_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = comments.task_id) AND user_has_organization_access(p.organization_id))))) OR ((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = comments.project_id) AND user_has_organization_access(p.organization_id)))))));

alter policy "Users can view comments on their tasks" on public.comments
  using ((((task_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = comments.task_id) AND user_has_organization_access(p.organization_id))))) OR ((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = comments.project_id) AND user_has_organization_access(p.organization_id)))))));

alter policy "Users can view comments in their organizations" on public.comments
  using (((task_id IN ( SELECT t.id
   FROM ((tasks t
     JOIN projects p ON ((t.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))) OR (project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid())))));

alter policy "Users can manage sections in their projects" on public.sections
  using ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = sections.project_id) AND user_has_organization_access(p.organization_id)))));

alter policy "Users can create sections in their projects" on public.sections
  with check ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))));

alter policy "Users can delete sections in their projects" on public.sections
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))));

alter policy "Users can update sections in their projects" on public.sections
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))));

alter policy "Users can view sections in their projects" on public.sections
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))));

alter policy "Users can create goals in their projects" on public.goals
  with check ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))));

alter policy "Users can delete goals in their projects" on public.goals
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))));

alter policy "Users can update goals in their projects" on public.goals
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))));

alter policy "Users can view goals in their projects" on public.goals
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = auth.uid()))));

alter policy "Users can delete on-hand supplies in their projects" on public.on_hand_supplies
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))));

alter policy "Users can insert on-hand supplies in their projects" on public.on_hand_supplies
  with check ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))));

alter policy "Users can update on-hand supplies in their projects" on public.on_hand_supplies
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))));

alter policy "Users can view on-hand supplies in their projects" on public.on_hand_supplies
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))));

alter policy "Users can view plans in their orgs" on public.plans
  using (((organization_id IN ( SELECT uo.organization_id
   FROM user_organizations uo
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (goal_id IN ( SELECT g.id
   FROM ((goals g
     JOIN projects p ON ((g.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (section_id IN ( SELECT s.id
   FROM ((sections s
     JOIN projects p ON ((s.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid))))));

alter policy "Users can update plans in their orgs" on public.plans
  using (((organization_id IN ( SELECT uo.organization_id
   FROM user_organizations uo
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (goal_id IN ( SELECT g.id
   FROM ((goals g
     JOIN projects p ON ((g.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (section_id IN ( SELECT s.id
   FROM ((sections s
     JOIN projects p ON ((s.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid))))));

alter policy "Users can delete plans in their orgs" on public.plans
  using (((organization_id IN ( SELECT uo.organization_id
   FROM user_organizations uo
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (goal_id IN ( SELECT g.id
   FROM ((goals g
     JOIN projects p ON ((g.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (section_id IN ( SELECT s.id
   FROM ((sections s
     JOIN projects p ON ((s.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid))))));

alter policy "Users can create plans in their orgs" on public.plans
  with check (((organization_id IN ( SELECT uo.organization_id
   FROM user_organizations uo
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (project_id IN ( SELECT p.id
   FROM (projects p
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (goal_id IN ( SELECT g.id
   FROM ((goals g
     JOIN projects p ON ((g.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid)))) OR (section_id IN ( SELECT s.id
   FROM ((sections s
     JOIN projects p ON ((s.project_id = p.id)))
     JOIN user_organizations uo ON ((p.organization_id = uo.organization_id)))
  WHERE (uo.user_id = ( SELECT auth.uid() AS uid))))));

alter policy "project_shares_member_all" on public.project_shares
  using (((EXISTS ( SELECT 1
   FROM user_projects up
  WHERE ((up.project_id = project_shares.project_id) AND (up.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (projects p
     JOIN user_organizations uo ON ((uo.organization_id = p.organization_id)))
  WHERE ((p.id = project_shares.project_id) AND (uo.user_id = auth.uid()))))))
  with check (((EXISTS ( SELECT 1
   FROM user_projects up
  WHERE ((up.project_id = project_shares.project_id) AND (up.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (projects p
     JOIN user_organizations uo ON ((uo.organization_id = p.organization_id)))
  WHERE ((p.id = project_shares.project_id) AND (uo.user_id = auth.uid()))))));

alter policy "Users can view entity events in their organizations" on public.entity_events
  using ((user_has_organization_access(organization_id) OR is_super_admin()));

commit;

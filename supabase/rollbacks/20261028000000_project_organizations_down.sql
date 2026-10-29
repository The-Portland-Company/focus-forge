-- Rollback for 20261028000000_project_organizations.sql.
-- Order: 20261028000200 down, 20261028000100 down (policies), then this file.
-- Dropping the table loses only the ADDITIONAL (shared) org links; every
-- project keeps its projects.organization_id, which was never modified.
-- Take a copy first if you want to restore sharing later:
--   create table public.project_organizations_backup as table public.project_organizations;

begin;

drop trigger if exists trg_reassign_shared_projects_before_org_delete on public.organizations;
drop trigger if exists trg_guard_project_primary_org_change on public.projects;
drop trigger if exists trg_sync_project_primary_org on public.projects;

drop table if exists public.project_organizations;

drop function if exists public.reassign_shared_projects_before_org_delete();
drop function if exists public.guard_project_primary_org_change();
drop function if exists public.sync_project_primary_org();

drop function if exists public.is_project_primary_org_admin(uuid);
drop function if exists public.is_project_org_admin(uuid);
drop function if exists public.project_org_ids(uuid);
drop function if exists public.user_has_project_org_access(uuid);
drop function if exists public.user_belongs_to_project_org(uuid);

commit;

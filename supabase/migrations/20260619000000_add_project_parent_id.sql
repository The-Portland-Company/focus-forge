-- Sub-projects: let a project be nested under another project.
-- parent_id references another project; ON DELETE SET NULL so deleting a parent
-- promotes its children to top-level rather than cascading them away.
alter table public.projects
  add column if not exists parent_id uuid references public.projects(id) on delete set null;

create index if not exists idx_projects_parent_id on public.projects(parent_id);

-- A project can't be its own parent. (Deeper cycles are prevented in app code.)
alter table public.projects
  drop constraint if exists projects_parent_not_self;
alter table public.projects
  add constraint projects_parent_not_self check (parent_id is null or parent_id <> id);

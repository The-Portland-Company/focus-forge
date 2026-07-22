-- Sections (task lists) can nest inside one another: dragging a task list onto
-- another nests it. The client and PUT /api/sections/[id] already write a
-- `parent_id`, but the backing column was never added, so every section-into-
-- section drop failed with `column "parent_id" does not exist` ("Could not
-- move …"). This adds the self-referential column.
--
-- ON DELETE SET NULL mirrors goal_id: deleting a parent list un-nests its
-- children rather than cascade-deleting them. Additive and nullable, so every
-- existing section stays valid as a top-level list.
alter table public.sections
  add column if not exists parent_id uuid
    references public.sections(id) on delete set null;

create index if not exists sections_parent_id_idx
  on public.sections (parent_id);

comment on column public.sections.parent_id is
  'Parent section (task list) this list is nested under; null = top level.';

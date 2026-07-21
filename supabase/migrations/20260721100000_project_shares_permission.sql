-- Share links were read-only by construction. Add an explicit permission level
-- so a link can be issued as read-write (visitors may tick tasks off and add
-- new ones from the public page).
--
-- Defaults to 'read' so every pre-existing link keeps its current behaviour.
-- Written defensively: project_shares was created out-of-band and has no
-- migration of its own in this repo.
alter table public.project_shares
  add column if not exists permission text not null default 'read';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_shares_permission_check'
  ) then
    alter table public.project_shares
      add constraint project_shares_permission_check
      check (permission in ('read', 'write'));
  end if;
end $$;

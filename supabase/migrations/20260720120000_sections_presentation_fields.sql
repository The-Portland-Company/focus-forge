-- The add/edit task-list modal has always collected a description, color and
-- icon, but the sections table had no columns to store them, so every value
-- was silently dropped. Add them so create and edit round-trip.
alter table public.sections
  add column if not exists description text,
  add column if not exists color text,
  add column if not exists icon text;

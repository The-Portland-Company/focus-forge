-- Add an enduring "mission" statement to projects.
-- Mission is distinct from the existing `goal` column: goal is the current
-- objective, mission is the durable purpose of the project.
-- Additive + idempotent so it replays cleanly on a fresh database.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS mission text;

COMMENT ON COLUMN public.projects.mission IS 'The enduring purpose / mission statement of the project.';

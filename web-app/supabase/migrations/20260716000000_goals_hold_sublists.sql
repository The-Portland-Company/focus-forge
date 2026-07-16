-- Goals as containers: a Goal can hold Sections (Task Lists), sub-Goals, and Tasks.
-- Additive + nullable + idempotent; existing rows unaffected.

-- A Section can optionally belong to a Goal (in addition to its project).
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL;

-- A Goal can optionally nest under a parent Goal (sub-goals).
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS parent_goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sections_goal_id ON public.sections (goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goals_parent_goal_id ON public.goals (parent_goal_id) WHERE parent_goal_id IS NOT NULL;

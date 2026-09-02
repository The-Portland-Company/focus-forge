-- Task reorganization batches: an undoable record of an AI-assisted bulk move
-- of tasks out of one project into better-fit projects. A batch groups the moves
-- so the whole run (or a cherry-picked subset) can be rolled back later.
--
-- RLS mirrors the inlined-membership pattern used by 20260815000000_plans.sql:
-- auth.uid() wrapped in (select ...) so the planner evaluates it once, and every
-- membership subquery targets OTHER tables (never these) so there is no RLS
-- recursion. No SECURITY DEFINER helper is exposed.

-- ---------------------------------------------------------------------------
-- task_reorg_batches — one row per reorganize run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_reorg_batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  summary jsonb,
  status text DEFAULT 'applied'
);

CREATE INDEX IF NOT EXISTS idx_task_reorg_batches_organization_id
  ON public.task_reorg_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_reorg_batches_project_id
  ON public.task_reorg_batches(project_id);

-- ---------------------------------------------------------------------------
-- task_reorg_moves — one row per task moved within a batch.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_reorg_moves (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.task_reorg_batches(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  before_project_id uuid,
  before_section_id uuid,
  after_project_id uuid,
  after_section_id uuid,
  reason text,
  confidence numeric,
  restored boolean DEFAULT false,
  restored_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_task_reorg_moves_batch_id
  ON public.task_reorg_moves(batch_id);
CREATE INDEX IF NOT EXISTS idx_task_reorg_moves_task_id
  ON public.task_reorg_moves(task_id);

-- ---------------------------------------------------------------------------
-- RLS — org members can read/insert/update their org's batches and moves.
-- ---------------------------------------------------------------------------
ALTER TABLE public.task_reorg_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reorg_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view reorg batches" ON public.task_reorg_batches;
DROP POLICY IF EXISTS "Members can create reorg batches" ON public.task_reorg_batches;
DROP POLICY IF EXISTS "Members can update reorg batches" ON public.task_reorg_batches;

CREATE POLICY "Members can view reorg batches" ON public.task_reorg_batches
  FOR SELECT USING (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can create reorg batches" ON public.task_reorg_batches
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can update reorg batches" ON public.task_reorg_batches
  FOR UPDATE USING (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can view reorg moves" ON public.task_reorg_moves;
DROP POLICY IF EXISTS "Members can create reorg moves" ON public.task_reorg_moves;
DROP POLICY IF EXISTS "Members can update reorg moves" ON public.task_reorg_moves;

-- Moves resolve their org through the parent batch (never through this table).
CREATE POLICY "Members can view reorg moves" ON public.task_reorg_moves
  FOR SELECT USING (
    batch_id IN (
      SELECT b.id FROM public.task_reorg_batches b
      JOIN public.user_organizations uo ON uo.organization_id = b.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can create reorg moves" ON public.task_reorg_moves
  FOR INSERT WITH CHECK (
    batch_id IN (
      SELECT b.id FROM public.task_reorg_batches b
      JOIN public.user_organizations uo ON uo.organization_id = b.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can update reorg moves" ON public.task_reorg_moves
  FOR UPDATE USING (
    batch_id IN (
      SELECT b.id FROM public.task_reorg_batches b
      JOIN public.user_organizations uo ON uo.organization_id = b.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

-- Domino Effect — Stakes, chains & weighted scheduling (Phase 1).
-- Four tables: stakes, stake_edges, task_stakes, stake_extraction_examples.
-- Soft-delete columns (deleted_at, delete_batch_id) follow the entity_versioning
-- precedent (supabase/migrations/20260603190000_entity_versioning.sql).
-- See web-app/docs/domino-effect-stakes-plan.md (Phase 1).

-- ---------------------------------------------------------------------------
-- 1. stakes — first-class consequence/reward entities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('consequence', 'reward')),
  name TEXT NOT NULL,
  description TEXT,
  monetary_value NUMERIC CHECK (monetary_value IS NULL OR monetary_value >= 0),
  severity TEXT CHECK (severity IS NULL OR severity IN ('minor', 'moderate', 'severe', 'critical')),
  trigger_at TIMESTAMPTZ,
  recurrence TEXT,
  recurrence_interval_days INTEGER CHECK (recurrence_interval_days IS NULL OR recurrence_interval_days > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'defused', 'eliminated', 'expired')),
  deleted_at TIMESTAMPTZ,
  delete_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stakes_organization_id ON public.stakes (organization_id);
CREATE INDEX IF NOT EXISTS idx_stakes_project_id ON public.stakes (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stakes_deleted_at ON public.stakes (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stakes_delete_batch ON public.stakes (delete_batch_id) WHERE delete_batch_id IS NOT NULL;
-- Accelerate "which dominoes fall soon" scans.
CREATE INDEX IF NOT EXISTS idx_stakes_active_trigger_at
  ON public.stakes (trigger_at)
  WHERE status = 'active' AND deleted_at IS NULL;

ALTER TABLE public.stakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stakes_org_select" ON public.stakes;
CREATE POLICY "stakes_org_select" ON public.stakes FOR SELECT
  USING (public.user_has_organization_access(organization_id));

DROP POLICY IF EXISTS "stakes_org_insert" ON public.stakes;
CREATE POLICY "stakes_org_insert" ON public.stakes FOR INSERT
  WITH CHECK (public.user_has_organization_access(organization_id));

DROP POLICY IF EXISTS "stakes_org_update" ON public.stakes;
CREATE POLICY "stakes_org_update" ON public.stakes FOR UPDATE
  USING (public.user_has_organization_access(organization_id))
  WITH CHECK (public.user_has_organization_access(organization_id));

DROP POLICY IF EXISTS "stakes_org_delete" ON public.stakes;
CREATE POLICY "stakes_org_delete" ON public.stakes FOR DELETE
  USING (public.user_has_organization_access(organization_id));

-- ---------------------------------------------------------------------------
-- 2. stake_edges — cascade chains (parent stake → child stake)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stake_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_stake_id UUID NOT NULL REFERENCES public.stakes(id) ON DELETE CASCADE,
  child_stake_id UUID NOT NULL REFERENCES public.stakes(id) ON DELETE CASCADE,
  weight_multiplier NUMERIC NOT NULL DEFAULT 0.7,
  deleted_at TIMESTAMPTZ,
  delete_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stake_edges_no_self CHECK (parent_stake_id <> child_stake_id),
  CONSTRAINT stake_edges_unique UNIQUE (parent_stake_id, child_stake_id)
);

CREATE INDEX IF NOT EXISTS idx_stake_edges_parent ON public.stake_edges (parent_stake_id);
CREATE INDEX IF NOT EXISTS idx_stake_edges_child ON public.stake_edges (child_stake_id);
CREATE INDEX IF NOT EXISTS idx_stake_edges_deleted_at ON public.stake_edges (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stake_edges_delete_batch ON public.stake_edges (delete_batch_id) WHERE delete_batch_id IS NOT NULL;

-- Reject cycles: an edge (parent → child) is invalid if child can already
-- reach parent through the existing edge graph.
CREATE OR REPLACE FUNCTION public.stake_edges_reject_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE reachable AS (
      SELECT e.child_stake_id AS node
      FROM public.stake_edges e
      WHERE e.parent_stake_id = NEW.child_stake_id
        AND e.deleted_at IS NULL
      UNION
      SELECT e.child_stake_id
      FROM public.stake_edges e
      JOIN reachable r ON e.parent_stake_id = r.node
      WHERE e.deleted_at IS NULL
    )
    SELECT 1 FROM reachable WHERE node = NEW.parent_stake_id
  ) THEN
    RAISE EXCEPTION 'stake_edges: adding edge % -> % would create a cycle',
      NEW.parent_stake_id, NEW.child_stake_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stake_edges_reject_cycle_trg ON public.stake_edges;
CREATE TRIGGER stake_edges_reject_cycle_trg
  BEFORE INSERT ON public.stake_edges
  FOR EACH ROW EXECUTE FUNCTION public.stake_edges_reject_cycle();

ALTER TABLE public.stake_edges ENABLE ROW LEVEL SECURITY;

-- Edge access mirrors the parent stake's org (task_tags-style EXISTS join).
DROP POLICY IF EXISTS "stake_edges_select" ON public.stake_edges;
CREATE POLICY "stake_edges_select" ON public.stake_edges FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.stakes s
    WHERE s.id = stake_edges.parent_stake_id
      AND public.user_has_organization_access(s.organization_id)
  ));

DROP POLICY IF EXISTS "stake_edges_insert" ON public.stake_edges;
CREATE POLICY "stake_edges_insert" ON public.stake_edges FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stakes s
    WHERE s.id = stake_edges.parent_stake_id
      AND public.user_has_organization_access(s.organization_id)
  ));

DROP POLICY IF EXISTS "stake_edges_update" ON public.stake_edges;
CREATE POLICY "stake_edges_update" ON public.stake_edges FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.stakes s
    WHERE s.id = stake_edges.parent_stake_id
      AND public.user_has_organization_access(s.organization_id)
  ));

DROP POLICY IF EXISTS "stake_edges_delete" ON public.stake_edges;
CREATE POLICY "stake_edges_delete" ON public.stake_edges FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.stakes s
    WHERE s.id = stake_edges.parent_stake_id
      AND public.user_has_organization_access(s.organization_id)
  ));

-- ---------------------------------------------------------------------------
-- 3. task_stakes — task ↔ stake resolver links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_stakes (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  stake_id UUID NOT NULL REFERENCES public.stakes(id) ON DELETE CASCADE,
  resolution_type TEXT NOT NULL CHECK (resolution_type IN ('defuses_once', 'eliminates')),
  deleted_at TIMESTAMPTZ,
  delete_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, stake_id)
);

CREATE INDEX IF NOT EXISTS idx_task_stakes_task ON public.task_stakes (task_id);
CREATE INDEX IF NOT EXISTS idx_task_stakes_stake ON public.task_stakes (stake_id);
CREATE INDEX IF NOT EXISTS idx_task_stakes_deleted_at ON public.task_stakes (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_stakes_delete_batch ON public.task_stakes (delete_batch_id) WHERE delete_batch_id IS NOT NULL;

ALTER TABLE public.task_stakes ENABLE ROW LEVEL SECURITY;

-- Link access mirrors the linked stake's org (EXISTS join).
DROP POLICY IF EXISTS "task_stakes_select" ON public.task_stakes;
CREATE POLICY "task_stakes_select" ON public.task_stakes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.stakes s
    WHERE s.id = task_stakes.stake_id
      AND public.user_has_organization_access(s.organization_id)
  ));

DROP POLICY IF EXISTS "task_stakes_insert" ON public.task_stakes;
CREATE POLICY "task_stakes_insert" ON public.task_stakes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stakes s
    WHERE s.id = task_stakes.stake_id
      AND public.user_has_organization_access(s.organization_id)
  ));

DROP POLICY IF EXISTS "task_stakes_update" ON public.task_stakes;
CREATE POLICY "task_stakes_update" ON public.task_stakes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.stakes s
    WHERE s.id = task_stakes.stake_id
      AND public.user_has_organization_access(s.organization_id)
  ));

DROP POLICY IF EXISTS "task_stakes_delete" ON public.task_stakes;
CREATE POLICY "task_stakes_delete" ON public.task_stakes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.stakes s
    WHERE s.id = task_stakes.stake_id
      AND public.user_has_organization_access(s.organization_id)
  ));

-- ---------------------------------------------------------------------------
-- 4. stake_extraction_examples — per-user few-shot calibration for NL capture
--    (mirrors task_estimate_examples)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stake_extraction_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_input TEXT NOT NULL,
  accepted_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stake_extraction_examples_user_created
  ON public.stake_extraction_examples (user_id, created_at DESC);

ALTER TABLE public.stake_extraction_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stake_extraction_examples_own_select" ON public.stake_extraction_examples;
CREATE POLICY "stake_extraction_examples_own_select"
  ON public.stake_extraction_examples FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "stake_extraction_examples_own_insert" ON public.stake_extraction_examples;
CREATE POLICY "stake_extraction_examples_own_insert"
  ON public.stake_extraction_examples FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "stake_extraction_examples_own_delete" ON public.stake_extraction_examples;
CREATE POLICY "stake_extraction_examples_own_delete"
  ON public.stake_extraction_examples FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. updated_at maintenance for stakes
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_stakes_updated_at ON public.stakes;
CREATE TRIGGER update_stakes_updated_at BEFORE UPDATE ON public.stakes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Plans entity: a plan.md markdown document attached to EXACTLY ONE of an
-- Organization, Project, Goal, or Section (task list). An entity may hold many
-- plans. Plans are human-authored/editable and AI-writable via the mobile API.
-- Fully wired into the entity-versioning system — every hardcoded per-entity
-- site (entity_events CHECK, log_entity_event CASE + scope resolution, trigger,
-- soft_delete_entity cascades + branch, restore_entity) is extended here.
-- Mirrors 20260714130000_goals.sql.

-- ---------------------------------------------------------------------------
-- plans table — four nullable owner FKs, exactly one non-null (CHECK).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES public.goals(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  name text NOT NULL,
  content_markdown text NOT NULL DEFAULT '',
  order_index integer DEFAULT 0,
  deleted_at timestamptz,
  delete_batch_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT plans_exactly_one_owner CHECK (
    num_nonnulls(organization_id, project_id, goal_id, section_id) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_plans_organization_id ON public.plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_plans_project_id ON public.plans(project_id);
CREATE INDEX IF NOT EXISTS idx_plans_goal_id ON public.plans(goal_id);
CREATE INDEX IF NOT EXISTS idx_plans_section_id ON public.plans(section_id);
CREATE INDEX IF NOT EXISTS idx_plans_deleted_at ON public.plans(deleted_at);
CREATE INDEX IF NOT EXISTS idx_plans_delete_batch ON public.plans(delete_batch_id);

-- ---------------------------------------------------------------------------
-- RLS — visibility resolves to org membership through whichever owner FK is set.
-- Inlined (like the goals policies) rather than a SECURITY DEFINER helper, so no
-- anon/authenticated-executable RPC is exposed. auth.uid() is wrapped in a
-- (select ...) so the planner evaluates it once (hardening pattern). Every
-- subquery targets OTHER tables (never plans), so there is no RLS recursion.
-- ---------------------------------------------------------------------------
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view plans in their orgs" ON public.plans;
DROP POLICY IF EXISTS "Users can create plans in their orgs" ON public.plans;
DROP POLICY IF EXISTS "Users can update plans in their orgs" ON public.plans;
DROP POLICY IF EXISTS "Users can delete plans in their orgs" ON public.plans;

-- Reusable visibility predicate (kept as text here for readability; the same
-- expression is used for all four commands).
--   org  : direct membership
--   proj : projects → user_organizations
--   goal : goals → projects → user_organizations
--   sect : sections → projects → user_organizations
CREATE POLICY "Users can view plans in their orgs" ON public.plans
  FOR SELECT USING (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR goal_id IN (
      SELECT g.id FROM public.goals g
      JOIN public.projects p ON g.project_id = p.id
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR section_id IN (
      SELECT s.id FROM public.sections s
      JOIN public.projects p ON s.project_id = p.id
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can create plans in their orgs" ON public.plans
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR goal_id IN (
      SELECT g.id FROM public.goals g
      JOIN public.projects p ON g.project_id = p.id
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR section_id IN (
      SELECT s.id FROM public.sections s
      JOIN public.projects p ON s.project_id = p.id
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update plans in their orgs" ON public.plans
  FOR UPDATE USING (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR goal_id IN (
      SELECT g.id FROM public.goals g
      JOIN public.projects p ON g.project_id = p.id
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR section_id IN (
      SELECT s.id FROM public.sections s
      JOIN public.projects p ON s.project_id = p.id
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete plans in their orgs" ON public.plans
  FOR DELETE USING (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR goal_id IN (
      SELECT g.id FROM public.goals g
      JOIN public.projects p ON g.project_id = p.id
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
    OR section_id IN (
      SELECT s.id FROM public.sections s
      JOIN public.projects p ON s.project_id = p.id
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Entity-versioning wiring (extend each hardcoded site for 'plan')
-- ---------------------------------------------------------------------------

-- 1) entity_events.entity_type CHECK constraint — add 'plan'.
ALTER TABLE public.entity_events
  DROP CONSTRAINT IF EXISTS entity_events_entity_type_check;
ALTER TABLE public.entity_events
  ADD CONSTRAINT entity_events_entity_type_check
  CHECK (entity_type IN ('organization', 'project', 'section', 'task', 'goal', 'plan'));

-- 2) log_entity_event() — add the plans→plan mapping AND a plan-specific scope
-- resolver (plans have no guaranteed project_id; derive org/project from the
-- owner FK that is set). Body is the live version from 20260714130000 with the
-- plan arms added.
CREATE OR REPLACE FUNCTION public.log_entity_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_type TEXT;
  v_op TEXT;
  v_org UUID;
  v_project UUID;
  v_actor UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  v_type := CASE TG_TABLE_NAME
    WHEN 'organizations' THEN 'organization'
    WHEN 'projects' THEN 'project'
    WHEN 'sections' THEN 'section'
    WHEN 'tasks' THEN 'task'
    WHEN 'goals' THEN 'goal'
    WHEN 'plans' THEN 'plan'
  END;

  -- Determine operation
  IF TG_OP = 'INSERT' THEN
    v_op := 'create';
  ELSIF TG_OP = 'DELETE' THEN
    v_op := 'purge';
  ELSE
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_op := 'delete';
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      v_op := 'restore';
    ELSIF TG_TABLE_NAME = 'tasks'
          AND (to_jsonb(NEW) ->> 'completed') IS DISTINCT FROM (to_jsonb(OLD) ->> 'completed') THEN
      v_op := CASE WHEN (to_jsonb(NEW) ->> 'completed')::boolean THEN 'complete' ELSE 'uncomplete' END;
    ELSE
      RETURN COALESCE(NEW, OLD); -- not an event we track in v1
    END IF;
  END IF;

  -- Denormalized scope ids
  IF TG_TABLE_NAME = 'organizations' THEN
    v_org := v_row.id;
    v_project := NULL;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    v_org := v_row.organization_id;
    v_project := v_row.id;
  ELSIF TG_TABLE_NAME = 'plans' THEN
    -- Plans attach to exactly one of org/project/goal/section; resolve both ids.
    IF v_row.organization_id IS NOT NULL THEN
      v_org := v_row.organization_id;
      v_project := NULL;
    ELSIF v_row.project_id IS NOT NULL THEN
      v_project := v_row.project_id;
      SELECT p.organization_id INTO v_org FROM public.projects p WHERE p.id = v_row.project_id;
    ELSIF v_row.goal_id IS NOT NULL THEN
      SELECT g.project_id INTO v_project FROM public.goals g WHERE g.id = v_row.goal_id;
      SELECT p.organization_id INTO v_org FROM public.projects p WHERE p.id = v_project;
    ELSIF v_row.section_id IS NOT NULL THEN
      SELECT s.project_id INTO v_project FROM public.sections s WHERE s.id = v_row.section_id;
      SELECT p.organization_id INTO v_org FROM public.projects p WHERE p.id = v_project;
    END IF;
  ELSE
    v_project := v_row.project_id;
    SELECT p.organization_id INTO v_org FROM public.projects p WHERE p.id = v_row.project_id;
  END IF;

  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  INSERT INTO public.entity_events
    (entity_type, entity_id, operation, organization_id, project_id, delete_batch_id, snapshot, actor_id)
  VALUES
    (v_type, v_row.id, v_op, v_org, v_project,
     CASE WHEN v_op IN ('delete', 'restore') THEN COALESCE(NEW.delete_batch_id, OLD.delete_batch_id) ELSE NULL END,
     to_jsonb(v_row), v_actor);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_entity_event() FROM public, anon;

-- 3) Attach the trigger to plans.
DROP TRIGGER IF EXISTS log_entity_event_plans ON public.plans;
CREATE TRIGGER log_entity_event_plans
  AFTER INSERT OR UPDATE OR DELETE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_event();

-- 4) soft_delete_entity — add the 'plan' branch and capture plans in the
-- organization/project/section/goal cascades (same delete_batch_id). Body is
-- the live version from 20260714130000 with plan handling added.
CREATE OR REPLACE FUNCTION public.soft_delete_entity(p_entity_type TEXT, p_entity_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_batch UUID := gen_random_uuid();
  v_now TIMESTAMPTZ := NOW();
  v_count INTEGER := 0;
BEGIN
  IF p_entity_type = 'organization' THEN
    UPDATE organizations SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id = p_entity_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    UPDATE projects SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE organization_id = p_entity_id AND deleted_at IS NULL;
    UPDATE sections SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE deleted_at IS NULL AND project_id IN (SELECT id FROM projects WHERE delete_batch_id = v_batch);
    UPDATE goals SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE deleted_at IS NULL AND project_id IN (SELECT id FROM projects WHERE delete_batch_id = v_batch);
    UPDATE tasks SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE deleted_at IS NULL AND project_id IN (SELECT id FROM projects WHERE delete_batch_id = v_batch);
    -- Plans owned directly by the org, or by any of its cascaded children.
    UPDATE plans SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE deleted_at IS NULL AND (
        organization_id = p_entity_id
        OR project_id IN (SELECT id FROM projects WHERE delete_batch_id = v_batch)
        OR section_id IN (SELECT id FROM sections WHERE delete_batch_id = v_batch)
        OR goal_id IN (SELECT id FROM goals WHERE delete_batch_id = v_batch)
      );

  ELSIF p_entity_type = 'project' THEN
    UPDATE projects SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id = p_entity_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    UPDATE sections SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE project_id = p_entity_id AND deleted_at IS NULL;
    UPDATE goals SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE project_id = p_entity_id AND deleted_at IS NULL;
    UPDATE tasks SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE project_id = p_entity_id AND deleted_at IS NULL;
    UPDATE plans SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE deleted_at IS NULL AND (
        project_id = p_entity_id
        OR section_id IN (SELECT id FROM sections WHERE delete_batch_id = v_batch)
        OR goal_id IN (SELECT id FROM goals WHERE delete_batch_id = v_batch)
      );

  ELSIF p_entity_type = 'section' THEN
    UPDATE sections SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id = p_entity_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    UPDATE goals SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE section_id = p_entity_id AND deleted_at IS NULL;
    UPDATE plans SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE deleted_at IS NULL AND (
        section_id = p_entity_id
        OR goal_id IN (SELECT id FROM goals WHERE delete_batch_id = v_batch)
      );

  ELSIF p_entity_type = 'goal' THEN
    UPDATE goals SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id = p_entity_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    -- Orphan the goal's live tasks back to their section/project.
    UPDATE tasks SET goal_id = NULL, updated_at = v_now
      WHERE goal_id = p_entity_id AND deleted_at IS NULL;
    UPDATE plans SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE goal_id = p_entity_id AND deleted_at IS NULL;

  ELSIF p_entity_type = 'plan' THEN
    UPDATE plans SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id = p_entity_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_entity_type = 'task' THEN
    WITH RECURSIVE descendants AS (
      SELECT id FROM tasks WHERE id = p_entity_id
      UNION ALL
      SELECT t.id FROM tasks t JOIN descendants d ON t.parent_id = d.id
    )
    UPDATE tasks SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id IN (SELECT id FROM descendants) AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSE
    RAISE EXCEPTION 'Unknown entity type: %', p_entity_type;
  END IF;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Entity % % not found or already deleted', p_entity_type, p_entity_id;
  END IF;

  RETURN v_batch;
END;
$$;

-- 5) restore_entity — restore plans by batch alongside the other tables.
CREATE OR REPLACE FUNCTION public.restore_entity(p_batch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total INTEGER := 0;
  v_count INTEGER;
BEGIN
  UPDATE organizations SET deleted_at = NULL, delete_batch_id = NULL WHERE delete_batch_id = p_batch_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  UPDATE projects SET deleted_at = NULL, delete_batch_id = NULL WHERE delete_batch_id = p_batch_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  UPDATE sections SET deleted_at = NULL, delete_batch_id = NULL WHERE delete_batch_id = p_batch_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  UPDATE goals SET deleted_at = NULL, delete_batch_id = NULL WHERE delete_batch_id = p_batch_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  UPDATE tasks SET deleted_at = NULL, delete_batch_id = NULL WHERE delete_batch_id = p_batch_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  UPDATE plans SET deleted_at = NULL, delete_batch_id = NULL WHERE delete_batch_id = p_batch_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'No entities found for delete batch %', p_batch_id;
  END IF;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_entity(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_entity(UUID) TO authenticated;

-- updated_at maintenance trigger.
DROP TRIGGER IF EXISTS set_plans_updated_at ON public.plans;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_plans_updated_at
      BEFORE UPDATE ON public.plans
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

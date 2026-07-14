-- Goals entity: Organization → Project → (Section, optional) → Goal (optional) → Task.
-- Goals are project-scoped; section_id is nullable (an agent can create a goal
-- with only a project). Fully wired into the entity-versioning system — every
-- hardcoded per-entity site (entity_events CHECK, log_entity_event CASE,
-- trigger, soft_delete_entity cascades, restore_entity) is extended here.
-- See docs/goals-under-sections-plan.md.

-- ---------------------------------------------------------------------------
-- goals table (mirrors sections DDL + completion + soft-delete columns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  order_index integer DEFAULT 0,
  deleted_at timestamptz,
  delete_batch_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_section_id ON public.goals(section_id);
CREATE INDEX IF NOT EXISTS idx_goals_project_id ON public.goals(project_id);
CREATE INDEX IF NOT EXISTS idx_goals_deleted_at ON public.goals(deleted_at);
CREATE INDEX IF NOT EXISTS idx_goals_delete_batch ON public.goals(delete_batch_id);

-- tasks.goal_id — coexists with section_id and parent_id; SET NULL is a backstop
-- only (deletes are soft).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON public.tasks(goal_id);

-- ---------------------------------------------------------------------------
-- RLS — mirror sections (org-membership scoped through projects)
-- ---------------------------------------------------------------------------
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view goals in their projects" ON public.goals;
DROP POLICY IF EXISTS "Users can create goals in their projects" ON public.goals;
DROP POLICY IF EXISTS "Users can update goals in their projects" ON public.goals;
DROP POLICY IF EXISTS "Users can delete goals in their projects" ON public.goals;

CREATE POLICY "Users can view goals in their projects" ON public.goals
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create goals in their projects" ON public.goals
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update goals in their projects" ON public.goals
  FOR UPDATE USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete goals in their projects" ON public.goals
  FOR DELETE USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.user_organizations uo ON p.organization_id = uo.organization_id
      WHERE uo.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Entity-versioning wiring (nothing is automatic — extend each site for 'goal')
-- ---------------------------------------------------------------------------

-- 1) entity_events.entity_type CHECK constraint — add 'goal'.
ALTER TABLE public.entity_events
  DROP CONSTRAINT IF EXISTS entity_events_entity_type_check;
ALTER TABLE public.entity_events
  ADD CONSTRAINT entity_events_entity_type_check
  CHECK (entity_type IN ('organization', 'project', 'section', 'task', 'goal'));

-- 2) log_entity_event() — add the goals→goal table-name mapping. (Body is the
-- current live version from 20260617150000 with the goals CASE arm added; the
-- ELSE scope branch already derives org from project_id, which goals have.)
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

-- 3) Attach the trigger to goals.
DROP TRIGGER IF EXISTS log_entity_event_goals ON public.goals;
CREATE TRIGGER log_entity_event_goals
  AFTER INSERT OR UPDATE OR DELETE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_event();

-- 4) soft_delete_entity — add the 'goal' branch and capture goals in the
-- organization/project/section cascades.
--   * organization / project delete: soft-delete their goals in the same batch.
--   * section delete: soft-delete its goals in the same batch, DO NOT touch
--     tasks (tasks keep goal_id pointing at the soft-deleted goal and render
--     ungrouped) so section restore is lossless.
--   * explicit goal delete: stamp the goal and NULL its live tasks' goal_id
--     (orphan them back to the section/project) rather than deleting them.
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

  ELSIF p_entity_type = 'section' THEN
    -- Soft-delete the section and its goals in the same batch. Tasks keep their
    -- section_id/goal_id and remain live (mirrors prior ON DELETE SET NULL UX);
    -- deleted goals simply render as ungrouped, and restore is lossless.
    UPDATE sections SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id = p_entity_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    UPDATE goals SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE section_id = p_entity_id AND deleted_at IS NULL;

  ELSIF p_entity_type = 'goal' THEN
    UPDATE goals SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id = p_entity_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    -- Orphan the goal's live tasks back to their section/project.
    UPDATE tasks SET goal_id = NULL, updated_at = v_now
      WHERE goal_id = p_entity_id AND deleted_at IS NULL;

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

-- 5) restore_entity — restore goals by batch alongside the other four tables.
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

  IF v_total = 0 THEN
    RAISE EXCEPTION 'No entities found for delete batch %', p_batch_id;
  END IF;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_entity(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_entity(UUID) TO authenticated;

-- updated_at maintenance trigger, matching sections/tasks if one exists.
DROP TRIGGER IF EXISTS set_goals_updated_at ON public.goals;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_goals_updated_at
      BEFORE UPDATE ON public.goals
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

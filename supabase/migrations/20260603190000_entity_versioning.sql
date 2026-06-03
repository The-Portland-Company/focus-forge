-- Entity versioning: soft delete (trash) + immutable event log for
-- organizations / projects / sections / tasks.
-- See web-app/docs/version-control-history-plan.md

-- ---------------------------------------------------------------------------
-- 1. Soft-delete columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_batch_id UUID;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_batch_id UUID;
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_batch_id UUID;
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_organizations_deleted_at ON public.organizations (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON public.projects (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sections_deleted_at ON public.sections (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON public.tasks (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_delete_batch ON public.projects (delete_batch_id) WHERE delete_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sections_delete_batch ON public.sections (delete_batch_id) WHERE delete_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_delete_batch ON public.tasks (delete_batch_id) WHERE delete_batch_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Event log (immutable, append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('organization', 'project', 'section', 'task')),
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'complete', 'uncomplete', 'delete', 'restore', 'purge')),
  organization_id UUID,
  project_id UUID,
  delete_batch_id UUID,
  snapshot JSONB,
  actor_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_events_entity ON public.entity_events (entity_type, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_entity_events_org_time ON public.entity_events (organization_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_entity_events_project_time ON public.entity_events (project_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_entity_events_batch ON public.entity_events (delete_batch_id) WHERE delete_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_events_deletes ON public.entity_events (occurred_at) WHERE operation = 'delete';

ALTER TABLE public.entity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view entity events in their organizations" ON public.entity_events;
CREATE POLICY "Users can view entity events in their organizations"
  ON public.entity_events FOR SELECT
  USING (
    public.user_has_organization_access(organization_id)
    OR public.is_super_admin()
  );
-- No INSERT/UPDATE/DELETE policies: only the SECURITY DEFINER trigger writes.
REVOKE INSERT, UPDATE, DELETE ON public.entity_events FROM authenticated, anon;
GRANT SELECT ON public.entity_events TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Audit trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_entity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    ELSIF TG_TABLE_NAME = 'tasks' AND NEW.completed IS DISTINCT FROM OLD.completed THEN
      v_op := CASE WHEN NEW.completed THEN 'complete' ELSE 'uncomplete' END;
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
$$;

DROP TRIGGER IF EXISTS log_entity_event_organizations ON public.organizations;
CREATE TRIGGER log_entity_event_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_event();

DROP TRIGGER IF EXISTS log_entity_event_projects ON public.projects;
CREATE TRIGGER log_entity_event_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_event();

DROP TRIGGER IF EXISTS log_entity_event_sections ON public.sections;
CREATE TRIGGER log_entity_event_sections
  AFTER INSERT OR UPDATE OR DELETE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_event();

DROP TRIGGER IF EXISTS log_entity_event_tasks ON public.tasks;
CREATE TRIGGER log_entity_event_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_event();

-- ---------------------------------------------------------------------------
-- 4. Soft delete / restore RPCs (SECURITY INVOKER: RLS governs what the
--    caller may touch; cascades stamp a shared batch id for exact restore)
-- ---------------------------------------------------------------------------
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
    UPDATE tasks SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE deleted_at IS NULL AND project_id IN (SELECT id FROM projects WHERE delete_batch_id = v_batch);

  ELSIF p_entity_type = 'project' THEN
    UPDATE projects SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE id = p_entity_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    UPDATE sections SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE project_id = p_entity_id AND deleted_at IS NULL;
    UPDATE tasks SET deleted_at = v_now, delete_batch_id = v_batch
      WHERE project_id = p_entity_id AND deleted_at IS NULL;

  ELSIF p_entity_type = 'section' THEN
    -- Tasks keep their section_id and remain live (mirrors prior ON DELETE SET NULL UX)
    UPDATE sections SET deleted_at = v_now, delete_batch_id = v_batch
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

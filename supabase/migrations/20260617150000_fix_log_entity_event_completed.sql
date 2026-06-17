-- Fix log_entity_event(): updating a non-tasks entity (e.g. archiving a
-- project, renaming an org) raised 42703 "record \"new\" has no field
-- \"completed\"". PL/pgSQL plans the whole ELSIF expression against the row's
-- composite type, so `NEW.completed` failed to resolve for projects/sections/
-- organizations even though it was guarded by `TG_TABLE_NAME = 'tasks'`.
-- Reference the field via to_jsonb(...) so it is not statically planned.
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

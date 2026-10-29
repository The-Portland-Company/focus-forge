-- Restores soft_delete_entity to its pre-multi-org definition.

CREATE OR REPLACE FUNCTION public.soft_delete_entity(p_entity_type text, p_entity_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

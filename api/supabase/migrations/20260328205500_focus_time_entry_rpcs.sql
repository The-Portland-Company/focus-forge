CREATE OR REPLACE FUNCTION public.time_get_entry(p_entry_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT to_jsonb(entry_row)
  FROM (
    SELECT
      e.id,
      e.organization_id,
      e.user_id,
      e.project_id,
      e.section_id,
      e.title,
      e.description,
      e.timezone,
      e.started_at,
      e.ended_at,
      e.created_at,
      e.updated_at,
      e.source,
      e.source_metadata,
      CASE
        WHEN o.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', o.id, 'name', o.name)
      END AS organizations,
      CASE
        WHEN p.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', p.id,
          'email', p.email,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'role', p.role
        )
      END AS profiles,
      CASE
        WHEN pr.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', pr.id,
          'name', pr.name,
          'organization_id', pr.organization_id
        )
      END AS projects,
      CASE
        WHEN s.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'project_id', s.project_id
        )
      END AS sections,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'task_id', et.task_id,
              'tasks',
              CASE
                WHEN t.id IS NULL THEN NULL
                ELSE jsonb_build_object(
                  'id', t.id,
                  'name', t.name,
                  'project_id', t.project_id,
                  'section_id', t.section_id
                )
              END
            )
            ORDER BY et.created_at, et.task_id
          )
          FROM time_tracking.entry_tasks et
          LEFT JOIN public.tasks t ON t.id = et.task_id
          WHERE et.entry_id = e.id
        ),
        '[]'::jsonb
      ) AS entry_tasks
    FROM time_tracking.entries e
    JOIN public.organizations o ON o.id = e.organization_id
    JOIN public.profiles p ON p.id = e.user_id
    LEFT JOIN public.projects pr ON pr.id = e.project_id
    LEFT JOIN public.sections s ON s.id = e.section_id
    WHERE e.id = p_entry_id
    LIMIT 1
  ) AS entry_row;
$function$;

CREATE OR REPLACE FUNCTION public.time_list_entries(
  p_organization_id uuid DEFAULT NULL,
  p_user_ids uuid[] DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_started_after timestamptz DEFAULT NULL,
  p_ended_before timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    jsonb_agg(public.time_get_entry(e.id) ORDER BY e.started_at DESC),
    '[]'::jsonb
  )
  FROM time_tracking.entries e
  WHERE (p_organization_id IS NULL OR e.organization_id = p_organization_id)
    AND (
      p_user_ids IS NULL
      OR cardinality(p_user_ids) = 0
      OR e.user_id = ANY(p_user_ids)
    )
    AND (p_project_id IS NULL OR e.project_id = p_project_id)
    AND (p_section_id IS NULL OR e.section_id = p_section_id)
    AND (p_started_after IS NULL OR e.started_at >= p_started_after)
    AND (
      p_ended_before IS NULL
      OR COALESCE(e.ended_at, e.started_at) <= p_ended_before
    );
$function$;

CREATE OR REPLACE FUNCTION public.time_create_entry(
  p_organization_id uuid,
  p_user_id uuid,
  p_project_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_task_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_title text DEFAULT 'Focus session',
  p_description text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_started_at timestamptz DEFAULT now(),
  p_ended_at timestamptz DEFAULT NULL,
  p_source text DEFAULT 'focus_forge',
  p_source_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_entry_id uuid;
BEGIN
  INSERT INTO time_tracking.entries (
    organization_id,
    user_id,
    project_id,
    section_id,
    title,
    description,
    timezone,
    started_at,
    ended_at,
    source,
    source_metadata
  )
  VALUES (
    p_organization_id,
    p_user_id,
    p_project_id,
    p_section_id,
    p_title,
    p_description,
    p_timezone,
    p_started_at,
    p_ended_at,
    p_source,
    COALESCE(p_source_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_entry_id;

  IF COALESCE(cardinality(p_task_ids), 0) > 0 THEN
    INSERT INTO time_tracking.entry_tasks (entry_id, task_id)
    SELECT v_entry_id, task_id
    FROM unnest(p_task_ids) AS task_id;
  END IF;

  RETURN public.time_get_entry(v_entry_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.time_update_entry(
  p_entry_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_project_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_task_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_title text DEFAULT 'Focus session',
  p_description text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_started_at timestamptz DEFAULT now(),
  p_ended_at timestamptz DEFAULT NULL,
  p_source_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE time_tracking.entries
  SET
    organization_id = p_organization_id,
    user_id = p_user_id,
    project_id = p_project_id,
    section_id = p_section_id,
    title = p_title,
    description = p_description,
    timezone = p_timezone,
    started_at = p_started_at,
    ended_at = p_ended_at,
    source_metadata = COALESCE(p_source_metadata, '{}'::jsonb)
  WHERE id = p_entry_id;

  DELETE FROM time_tracking.entry_tasks
  WHERE entry_id = p_entry_id;

  IF COALESCE(cardinality(p_task_ids), 0) > 0 THEN
    INSERT INTO time_tracking.entry_tasks (entry_id, task_id)
    SELECT p_entry_id, task_id
    FROM unnest(p_task_ids) AS task_id;
  END IF;

  RETURN public.time_get_entry(p_entry_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.time_delete_entry(p_entry_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  DELETE FROM time_tracking.entries
  WHERE id = p_entry_id;
$function$;

GRANT EXECUTE ON FUNCTION public.time_get_entry(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.time_list_entries(uuid, uuid[], uuid, uuid, timestamptz, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.time_create_entry(uuid, uuid, uuid, uuid, uuid[], text, text, text, timestamptz, timestamptz, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.time_update_entry(uuid, uuid, uuid, uuid, uuid, uuid[], text, text, text, timestamptz, timestamptz, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.time_delete_entry(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.time_get_org_token(p_hashed_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT to_jsonb(token_row)
  FROM (
    SELECT
      t.id,
      t.organization_id,
      t.created_by,
      t.scopes,
      t.is_active,
      t.expires_at
    FROM time_tracking.api_tokens t
    WHERE t.hashed_key = p_hashed_key
    LIMIT 1
  ) AS token_row;
$function$;

CREATE OR REPLACE FUNCTION public.time_touch_org_token(p_token_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  UPDATE time_tracking.api_tokens
  SET last_used_at = now()
  WHERE id = p_token_id;
$function$;

CREATE OR REPLACE FUNCTION public.time_list_groups(p_org_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    jsonb_agg(group_row ORDER BY group_row->>'name'),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'id', g.id,
      'organization_id', g.organization_id,
      'name', g.name,
      'description', g.description,
      'created_by', g.created_by,
      'created_at', g.created_at,
      'updated_at', g.updated_at,
      'group_members', COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object('user_id', gm.user_id) ORDER BY gm.user_id)
          FROM time_tracking.group_members gm
          WHERE gm.group_id = g.id
        ),
        '[]'::jsonb
      )
    ) AS group_row
    FROM time_tracking.groups g
    WHERE g.organization_id = ANY(COALESCE(p_org_ids, ARRAY[]::uuid[]))
  ) grouped;
$function$;

CREATE OR REPLACE FUNCTION public.time_list_api_tokens(p_org_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    jsonb_agg(token_row ORDER BY token_sort_created_at DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT
      jsonb_build_object(
        'id', t.id,
        'organization_id', t.organization_id,
        'created_by', t.created_by,
        'name', t.name,
        'description', t.description,
        'prefix', t.prefix,
        'scopes', to_jsonb(t.scopes),
        'expires_at', t.expires_at,
        'last_used_at', t.last_used_at,
        'is_active', t.is_active,
        'share_mode', t.share_mode,
        'created_at', t.created_at,
        'token_users', COALESCE(
          (
            SELECT jsonb_agg(jsonb_build_object('user_id', tu.user_id) ORDER BY tu.user_id)
            FROM time_tracking.api_token_users tu
            WHERE tu.token_id = t.id
          ),
          '[]'::jsonb
        ),
        'token_groups', COALESCE(
          (
            SELECT jsonb_agg(jsonb_build_object('group_id', tg.group_id) ORDER BY tg.group_id)
            FROM time_tracking.api_token_groups tg
            WHERE tg.token_id = t.id
          ),
          '[]'::jsonb
        )
      ) AS token_row,
      t.created_at AS token_sort_created_at
    FROM time_tracking.api_tokens t
    WHERE t.organization_id = ANY(COALESCE(p_org_ids, ARRAY[]::uuid[]))
  ) tokens;
$function$;

CREATE OR REPLACE FUNCTION public.time_get_current_entry(
  p_org_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
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
    WHERE e.ended_at IS NULL
      AND (p_org_id IS NULL OR e.organization_id = p_org_id)
      AND (p_user_id IS NULL OR e.user_id = p_user_id)
    ORDER BY e.started_at DESC
    LIMIT 1
  ) AS entry_row;
$function$;

GRANT EXECUTE ON FUNCTION public.time_get_org_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.time_touch_org_token(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.time_list_groups(uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.time_list_api_tokens(uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.time_get_current_entry(uuid, uuid) TO anon, authenticated, service_role;

-- Fix functions that have `SET search_path = ''` but referenced unqualified relations.
-- This was causing runtime failures and `supabase db lint --linked` errors.

CREATE OR REPLACE FUNCTION public.log_todoist_api_call(
  p_user_id uuid,
  p_endpoint text,
  p_method text,
  p_status_code integer DEFAULT NULL::integer,
  p_response_time_ms integer DEFAULT NULL::integer,
  p_error_message text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_call_id uuid;
BEGIN
  INSERT INTO public.todoist_api_calls (
    user_id, endpoint, method, status_code, response_time_ms, error_message
  ) VALUES (
    p_user_id, p_endpoint, p_method, p_status_code, p_response_time_ms, p_error_message
  )
  RETURNING id INTO v_call_id;

  RETURN v_call_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_todoist_rate_limit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_recent_calls integer;
BEGIN
  -- Todoist limit is 450/min. Keep a small buffer.
  SELECT COUNT(*) INTO v_recent_calls
  FROM public.todoist_api_calls
  WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '1 minute';

  RETURN v_recent_calls < 450;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_next_sync_time(p_user_id uuid)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_sync_frequency integer;
BEGIN
  SELECT todoist_sync_frequency INTO v_sync_frequency
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN NOW() + (v_sync_frequency || ' minutes')::interval;
END;
$function$;

CREATE OR REPLACE FUNCTION public.backup_before_todoist_import(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_backup_id uuid;
  v_backup_data jsonb;
  v_item_count integer;
  v_project_count integer;
  v_tag_count integer;
BEGIN
  -- Gather all user data
  WITH user_data AS (
    SELECT
      (
        SELECT json_agg(t.*)
        FROM public.tasks t
        JOIN public.projects p ON p.id = t.project_id
        JOIN public.user_organizations uo ON uo.organization_id = p.organization_id
        WHERE uo.user_id = p_user_id
      ) AS tasks,
      (
        SELECT json_agg(p.*)
        FROM public.projects p
        JOIN public.user_organizations uo ON uo.organization_id = p.organization_id
        WHERE uo.user_id = p_user_id
      ) AS projects,
      (
        SELECT json_agg(tg.*)
        FROM public.tags tg
      ) AS tags
  )
  SELECT row_to_json(user_data.*) INTO v_backup_data FROM user_data;

  -- Count items
  SELECT COUNT(*) INTO v_item_count
  FROM public.tasks t
  JOIN public.projects p ON p.id = t.project_id
  JOIN public.user_organizations uo ON uo.organization_id = p.organization_id
  WHERE uo.user_id = p_user_id;

  SELECT COUNT(*) INTO v_project_count
  FROM public.projects p
  JOIN public.user_organizations uo ON uo.organization_id = p.organization_id
  WHERE uo.user_id = p_user_id;

  SELECT COUNT(*) INTO v_tag_count
  FROM public.tags;

  -- Create backup
  INSERT INTO public.todoist_import_backup (
    user_id, backup_type, data, item_count, project_count, tag_count
  ) VALUES (
    p_user_id, 'pre_import', v_backup_data, v_item_count, v_project_count, v_tag_count
  )
  RETURNING id INTO v_backup_id;

  RETURN v_backup_id;
END;
$function$;


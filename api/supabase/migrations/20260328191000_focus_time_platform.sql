CREATE SCHEMA IF NOT EXISTS time_tracking;

CREATE TABLE IF NOT EXISTS time_tracking.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS time_tracking.group_members (
  group_id uuid NOT NULL REFERENCES time_tracking.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS time_tracking.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  prefix text NOT NULL,
  hashed_key text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['read'],
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT TRUE,
  share_mode text NOT NULL DEFAULT 'private' CHECK (share_mode IN ('private', 'organization', 'selected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_tracking.api_token_users (
  token_id uuid NOT NULL REFERENCES time_tracking.api_tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_id, user_id)
);

CREATE TABLE IF NOT EXISTS time_tracking.api_token_groups (
  token_id uuid NOT NULL REFERENCES time_tracking.api_tokens(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES time_tracking.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_id, group_id)
);

CREATE TABLE IF NOT EXISTS time_tracking.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  timezone text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  source text NOT NULL DEFAULT 'focus_forge',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS time_tracking.entry_tasks (
  entry_id uuid NOT NULL REFERENCES time_tracking.entries(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_time_tracking_groups_org_id
ON time_tracking.groups (organization_id);

CREATE INDEX IF NOT EXISTS idx_time_tracking_group_members_user_id
ON time_tracking.group_members (user_id);

CREATE INDEX IF NOT EXISTS idx_time_tracking_api_tokens_org_id
ON time_tracking.api_tokens (organization_id);

CREATE INDEX IF NOT EXISTS idx_time_tracking_api_tokens_hashed_key
ON time_tracking.api_tokens (hashed_key);

CREATE INDEX IF NOT EXISTS idx_time_tracking_entries_org_id
ON time_tracking.entries (organization_id);

CREATE INDEX IF NOT EXISTS idx_time_tracking_entries_user_id
ON time_tracking.entries (user_id);

CREATE INDEX IF NOT EXISTS idx_time_tracking_entries_project_id
ON time_tracking.entries (project_id);

CREATE INDEX IF NOT EXISTS idx_time_tracking_entries_section_id
ON time_tracking.entries (section_id);

CREATE INDEX IF NOT EXISTS idx_time_tracking_entries_started_at
ON time_tracking.entries (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_tracking_entries_ended_at
ON time_tracking.entries (ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_tracking_entry_tasks_task_id
ON time_tracking.entry_tasks (task_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_tracking_running_entry_per_user
ON time_tracking.entries (user_id)
WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION time_tracking.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION time_tracking.user_is_org_member(
  p_user_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations
    WHERE user_id = p_user_id
      AND organization_id = p_org_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND role IN ('admin', 'super_admin')
  );
$function$;

CREATE OR REPLACE FUNCTION time_tracking.can_view_entry(
  p_user_id uuid,
  p_entry_user_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_user_id = p_entry_user_id THEN
    RETURN TRUE;
  END IF;

  RETURN public.is_org_admin(p_user_id, p_org_id);
END;
$function$;

CREATE OR REPLACE FUNCTION time_tracking.can_view_token(
  p_user_id uuid,
  p_token_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org_id uuid;
  v_created_by uuid;
  v_share_mode text;
BEGIN
  IF p_user_id IS NULL OR p_token_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT organization_id, created_by, share_mode
  INTO v_org_id, v_created_by, v_share_mode
  FROM time_tracking.api_tokens
  WHERE id = p_token_id;

  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_user_id = v_created_by OR public.is_org_admin(p_user_id, v_org_id) THEN
    RETURN TRUE;
  END IF;

  IF v_share_mode = 'organization' THEN
    RETURN time_tracking.user_is_org_member(p_user_id, v_org_id);
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM time_tracking.api_token_users tu
    WHERE tu.token_id = p_token_id
      AND tu.user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM time_tracking.api_token_groups tg
    JOIN time_tracking.group_members gm
      ON gm.group_id = tg.group_id
    WHERE tg.token_id = p_token_id
      AND gm.user_id = p_user_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION time_tracking.can_manage_token(
  p_user_id uuid,
  p_token_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org_id uuid;
  v_created_by uuid;
BEGIN
  IF p_user_id IS NULL OR p_token_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT organization_id, created_by
  INTO v_org_id, v_created_by
  FROM time_tracking.api_tokens
  WHERE id = p_token_id;

  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN p_user_id = v_created_by OR public.is_org_admin(p_user_id, v_org_id);
END;
$function$;

CREATE OR REPLACE FUNCTION time_tracking.can_manage_group(
  p_user_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM time_tracking.groups g
    WHERE g.id = p_group_id
      AND public.is_org_admin(p_user_id, g.organization_id)
  );
$function$;

ALTER TABLE time_tracking.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking.api_token_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking.api_token_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking.entry_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_tracking_groups_select" ON time_tracking.groups;
CREATE POLICY "time_tracking_groups_select"
ON time_tracking.groups
FOR SELECT
USING (time_tracking.user_is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "time_tracking_groups_manage" ON time_tracking.groups;
CREATE POLICY "time_tracking_groups_manage"
ON time_tracking.groups
FOR ALL
USING (public.is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "time_tracking_group_members_select" ON time_tracking.group_members;
CREATE POLICY "time_tracking_group_members_select"
ON time_tracking.group_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM time_tracking.groups g
    WHERE g.id = group_members.group_id
      AND time_tracking.user_is_org_member(auth.uid(), g.organization_id)
  )
);

DROP POLICY IF EXISTS "time_tracking_group_members_manage" ON time_tracking.group_members;
CREATE POLICY "time_tracking_group_members_manage"
ON time_tracking.group_members
FOR ALL
USING (time_tracking.can_manage_group(auth.uid(), group_id))
WITH CHECK (time_tracking.can_manage_group(auth.uid(), group_id));

DROP POLICY IF EXISTS "time_tracking_api_tokens_select" ON time_tracking.api_tokens;
CREATE POLICY "time_tracking_api_tokens_select"
ON time_tracking.api_tokens
FOR SELECT
USING (time_tracking.can_view_token(auth.uid(), id));

DROP POLICY IF EXISTS "time_tracking_api_tokens_insert" ON time_tracking.api_tokens;
CREATE POLICY "time_tracking_api_tokens_insert"
ON time_tracking.api_tokens
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND public.is_org_admin(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "time_tracking_api_tokens_manage" ON time_tracking.api_tokens;
CREATE POLICY "time_tracking_api_tokens_manage"
ON time_tracking.api_tokens
FOR UPDATE
USING (time_tracking.can_manage_token(auth.uid(), id))
WITH CHECK (time_tracking.can_manage_token(auth.uid(), id));

DROP POLICY IF EXISTS "time_tracking_api_tokens_delete" ON time_tracking.api_tokens;
CREATE POLICY "time_tracking_api_tokens_delete"
ON time_tracking.api_tokens
FOR DELETE
USING (time_tracking.can_manage_token(auth.uid(), id));

DROP POLICY IF EXISTS "time_tracking_api_token_users_select" ON time_tracking.api_token_users;
CREATE POLICY "time_tracking_api_token_users_select"
ON time_tracking.api_token_users
FOR SELECT
USING (time_tracking.can_view_token(auth.uid(), token_id));

DROP POLICY IF EXISTS "time_tracking_api_token_users_manage" ON time_tracking.api_token_users;
CREATE POLICY "time_tracking_api_token_users_manage"
ON time_tracking.api_token_users
FOR ALL
USING (time_tracking.can_manage_token(auth.uid(), token_id))
WITH CHECK (time_tracking.can_manage_token(auth.uid(), token_id));

DROP POLICY IF EXISTS "time_tracking_api_token_groups_select" ON time_tracking.api_token_groups;
CREATE POLICY "time_tracking_api_token_groups_select"
ON time_tracking.api_token_groups
FOR SELECT
USING (time_tracking.can_view_token(auth.uid(), token_id));

DROP POLICY IF EXISTS "time_tracking_api_token_groups_manage" ON time_tracking.api_token_groups;
CREATE POLICY "time_tracking_api_token_groups_manage"
ON time_tracking.api_token_groups
FOR ALL
USING (time_tracking.can_manage_token(auth.uid(), token_id))
WITH CHECK (time_tracking.can_manage_token(auth.uid(), token_id));

DROP POLICY IF EXISTS "time_tracking_entries_select" ON time_tracking.entries;
CREATE POLICY "time_tracking_entries_select"
ON time_tracking.entries
FOR SELECT
USING (time_tracking.can_view_entry(auth.uid(), user_id, organization_id));

DROP POLICY IF EXISTS "time_tracking_entries_insert" ON time_tracking.entries;
CREATE POLICY "time_tracking_entries_insert"
ON time_tracking.entries
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND time_tracking.user_is_org_member(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "time_tracking_entries_update" ON time_tracking.entries;
CREATE POLICY "time_tracking_entries_update"
ON time_tracking.entries
FOR UPDATE
USING (time_tracking.can_view_entry(auth.uid(), user_id, organization_id))
WITH CHECK (time_tracking.can_view_entry(auth.uid(), user_id, organization_id));

DROP POLICY IF EXISTS "time_tracking_entries_delete" ON time_tracking.entries;
CREATE POLICY "time_tracking_entries_delete"
ON time_tracking.entries
FOR DELETE
USING (time_tracking.can_view_entry(auth.uid(), user_id, organization_id));

DROP POLICY IF EXISTS "time_tracking_entry_tasks_select" ON time_tracking.entry_tasks;
CREATE POLICY "time_tracking_entry_tasks_select"
ON time_tracking.entry_tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM time_tracking.entries e
    WHERE e.id = entry_tasks.entry_id
      AND time_tracking.can_view_entry(auth.uid(), e.user_id, e.organization_id)
  )
);

DROP POLICY IF EXISTS "time_tracking_entry_tasks_manage" ON time_tracking.entry_tasks;
CREATE POLICY "time_tracking_entry_tasks_manage"
ON time_tracking.entry_tasks
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM time_tracking.entries e
    WHERE e.id = entry_tasks.entry_id
      AND time_tracking.can_view_entry(auth.uid(), e.user_id, e.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM time_tracking.entries e
    WHERE e.id = entry_tasks.entry_id
      AND time_tracking.can_view_entry(auth.uid(), e.user_id, e.organization_id)
  )
);

DROP TRIGGER IF EXISTS time_tracking_groups_updated_at ON time_tracking.groups;
CREATE TRIGGER time_tracking_groups_updated_at
  BEFORE UPDATE ON time_tracking.groups
  FOR EACH ROW
  EXECUTE FUNCTION time_tracking.set_updated_at();

DROP TRIGGER IF EXISTS time_tracking_api_tokens_updated_at ON time_tracking.api_tokens;
CREATE TRIGGER time_tracking_api_tokens_updated_at
  BEFORE UPDATE ON time_tracking.api_tokens
  FOR EACH ROW
  EXECUTE FUNCTION time_tracking.set_updated_at();

DROP TRIGGER IF EXISTS time_tracking_entries_updated_at ON time_tracking.entries;
CREATE TRIGGER time_tracking_entries_updated_at
  BEFORE UPDATE ON time_tracking.entries
  FOR EACH ROW
  EXECUTE FUNCTION time_tracking.set_updated_at();

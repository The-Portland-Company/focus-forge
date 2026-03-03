-- Security + performance fixes

-- Harden security definer functions (search_path + stable)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_id = auth.uid()
      AND organization_id = org_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_organization_access(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_id = auth.uid()
      AND organization_id = org_id
  ) OR is_super_admin();
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = p_user_id
      AND role IN ('admin', 'super_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM user_organizations
    WHERE user_id = p_user_id
      AND organization_id = p_org_id
      AND is_owner = TRUE
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

-- Add RLS policies for task_sections (RLS already enabled)
DROP POLICY IF EXISTS "Users can view task sections in their projects" ON public.task_sections;
DROP POLICY IF EXISTS "Users can manage task sections in their projects" ON public.task_sections;

CREATE POLICY "Users can view task sections in their projects"
ON public.task_sections
FOR SELECT
USING (
  task_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = task_sections.task_id
      AND user_has_organization_access(p.organization_id)
  )
);

CREATE POLICY "Users can manage task sections in their projects"
ON public.task_sections
FOR ALL
USING (
  task_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = task_sections.task_id
      AND user_has_organization_access(p.organization_id)
  )
)
WITH CHECK (
  task_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = task_sections.task_id
      AND user_has_organization_access(p.organization_id)
  )
);

-- Performance indexes for task listing queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_created_at
ON public.tasks (assigned_to, created_at);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id_created_at
ON public.tasks (project_id, created_at);

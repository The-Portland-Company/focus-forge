CREATE TABLE IF NOT EXISTS public.user_projects (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_user_projects_project_id
ON public.user_projects(project_id);

CREATE INDEX IF NOT EXISTS idx_user_projects_user_id
ON public.user_projects(user_id);

ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_has_project_membership(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_projects
    WHERE user_id = auth.uid()
      AND project_id = p_project_id
  );
$function$;

DROP POLICY IF EXISTS "Users can view project memberships" ON public.user_projects;
CREATE POLICY "Users can view project memberships"
ON public.user_projects
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = user_projects.project_id
      AND public.user_has_organization_access(p.organization_id)
  )
);

DROP POLICY IF EXISTS "Org admins can manage project memberships" ON public.user_projects;
CREATE POLICY "Org admins can manage project memberships"
ON public.user_projects
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = user_projects.project_id
      AND public.is_org_admin(auth.uid(), p.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = user_projects.project_id
      AND public.is_org_admin(auth.uid(), p.organization_id)
  )
);

INSERT INTO public.user_projects (user_id, project_id, is_owner)
SELECT DISTINCT uo.user_id, p.id, uo.is_owner
FROM public.projects p
JOIN public.user_organizations uo
  ON uo.organization_id = p.organization_id
  AND uo.is_owner = TRUE
ON CONFLICT (user_id, project_id) DO NOTHING;

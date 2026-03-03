-- Supabase Security Advisor hardening:
-- Make SECURITY DEFINER helper functions use an empty search_path and fully-qualified references.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
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
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND organization_id = org_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_organization_access(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND organization_id = org_id
  ) OR public.is_super_admin();
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND role IN ('admin', 'super_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_organizations
    WHERE user_id = p_user_id
      AND organization_id = p_org_id
      AND is_owner = TRUE
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;


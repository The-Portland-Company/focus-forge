-- API key management tables and security policies

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.personal_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prefix text NOT NULL,
  hashed_key text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['read'],
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.organization_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  hashed_key text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['read'],
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT TRUE
);

ALTER TABLE public.personal_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_personal_access_token(
  p_user_id uuid,
  p_token_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.personal_access_tokens
    WHERE id = p_token_id
      AND created_by = p_user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_org_api_key(
  p_user_id uuid,
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

  RETURN public.is_org_admin(p_user_id, p_org_id);
END;
$function$;

CREATE POLICY "Users can view own personal access tokens"
ON public.personal_access_tokens
FOR SELECT
USING (
  public.can_manage_personal_access_token(auth.uid(), id)
  OR public.is_super_admin()
);

CREATE POLICY "Users can create personal access tokens"
ON public.personal_access_tokens
FOR INSERT
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own personal access tokens"
ON public.personal_access_tokens
FOR UPDATE
USING (
  public.can_manage_personal_access_token(auth.uid(), id)
  OR public.is_super_admin()
)
WITH CHECK (
  public.can_manage_personal_access_token(auth.uid(), id)
  OR public.is_super_admin()
);

CREATE POLICY "Users can delete own personal access tokens"
ON public.personal_access_tokens
FOR DELETE
USING (
  public.can_manage_personal_access_token(auth.uid(), id)
  OR public.is_super_admin()
);

CREATE POLICY "Organization admins can view organization API keys"
ON public.organization_api_keys
FOR SELECT
USING (public.can_manage_org_api_key(auth.uid(), organization_id));

CREATE POLICY "Organization admins can create organization API keys"
ON public.organization_api_keys
FOR INSERT
WITH CHECK (public.can_manage_org_api_key(auth.uid(), organization_id));

CREATE POLICY "Organization admins can manage organization API keys"
ON public.organization_api_keys
FOR ALL
USING (public.can_manage_org_api_key(auth.uid(), organization_id))
WITH CHECK (public.can_manage_org_api_key(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS idx_personal_access_tokens_created_by
ON public.personal_access_tokens (created_by);
CREATE INDEX IF NOT EXISTS idx_personal_access_tokens_is_active
ON public.personal_access_tokens (is_active);
CREATE INDEX IF NOT EXISTS idx_personal_access_tokens_expires_at
ON public.personal_access_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_personal_access_tokens_hashed_key
ON public.personal_access_tokens (hashed_key);

CREATE INDEX IF NOT EXISTS idx_organization_api_keys_organization_id
ON public.organization_api_keys (organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_api_keys_is_active
ON public.organization_api_keys (is_active);
CREATE INDEX IF NOT EXISTS idx_organization_api_keys_expires_at
ON public.organization_api_keys (expires_at);
CREATE INDEX IF NOT EXISTS idx_organization_api_keys_hashed_key
ON public.organization_api_keys (hashed_key);

DROP TRIGGER IF EXISTS update_personal_access_tokens_updated_at ON public.personal_access_tokens;
CREATE TRIGGER update_personal_access_tokens_updated_at
  BEFORE UPDATE ON public.personal_access_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_api_keys_updated_at ON public.organization_api_keys;
CREATE TRIGGER update_organization_api_keys_updated_at
  BEFORE UPDATE ON public.organization_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

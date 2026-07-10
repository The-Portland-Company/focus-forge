-- Contacts feature: personal (per-user) ownership alongside existing org-shared contacts,
-- richer contact fields, import source tracking, and Google OAuth token storage for
-- Google People API contact import.
--
-- Ownership model ("Both"):
--   * organization_id IS NOT NULL, user_id IS NULL  -> org-shared contact (existing behavior)
--   * user_id IS NOT NULL                            -> personal contact owned by that user
-- The existing table-level UNIQUE (organization_id, email) still applies to org-shared rows
-- (NULL organization_id rows are distinct under that constraint, so personal rows never
-- collide there). Per-user uniqueness for personal contacts is enforced by a partial index.

BEGIN;

-- 1. New columns ------------------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text;

-- source values: 'manual' | 'mail' | 'google' | 'apple' | 'import'
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('manual', 'mail', 'google', 'apple', 'import'));

-- 2. Uniqueness for personal contacts (one row per (owner, email)) ----------
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_uniq
  ON public.contacts (user_id, lower(email))
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_lower_email ON public.contacts (lower(email));

-- 3. RLS: let a user read & manage their own personal contacts --------------
DROP POLICY IF EXISTS "Users can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can manage contacts" ON public.contacts;

CREATE POLICY "Users can view contacts" ON public.contacts
FOR SELECT USING (
  user_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
  OR profile_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.email_participants ep
    JOIN public.email_threads et ON et.id = ep.thread_id
    WHERE ep.contact_id = contacts.id
      AND public.user_can_access_mailbox(et.mailbox_id, auth.uid())
  )
);

CREATE POLICY "Users can manage contacts" ON public.contacts
FOR ALL USING (
  user_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
  OR profile_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
  OR profile_id = auth.uid()
);

-- 4. Google OAuth accounts for People API contact import --------------------
CREATE TABLE IF NOT EXISTS public.contact_google_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scope text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_email)
);

CREATE INDEX IF NOT EXISTS idx_contact_google_accounts_user_id
  ON public.contact_google_accounts (user_id);

ALTER TABLE public.contact_google_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own google accounts" ON public.contact_google_accounts;
DROP POLICY IF EXISTS "Users can manage own google accounts" ON public.contact_google_accounts;
-- Tokens are read/written by the server via the service-role (admin) client, which bypasses
-- RLS; these policies simply guarantee a normal authenticated user can only ever see/mutate
-- their own row if queried directly, and never another user's tokens.
CREATE POLICY "Users can view own google accounts" ON public.contact_google_accounts
FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own google accounts" ON public.contact_google_accounts
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_contact_google_accounts_updated_at ON public.contact_google_accounts;
CREATE TRIGGER update_contact_google_accounts_updated_at
  BEFORE UPDATE ON public.contact_google_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

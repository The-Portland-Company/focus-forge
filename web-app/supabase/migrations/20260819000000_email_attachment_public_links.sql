-- Public share links for email attachments.
--
-- An authenticated user mints a token for one specific (message, attachment
-- index). Anyone holding the token can fetch that ONE attachment via
-- /api/public/attachments/{token} with NO session — the route re-fetches the
-- file from the mailbox owner's IMAP server-side (attachments are never stored;
-- they stream live from the provider). The token, not a session, gates the read.
--
-- Tokens are unguessable (32 random bytes, url-safe), revocable (revoked_at),
-- and optionally expiring (expires_at NULL = no expiry). A link scopes to a
-- single attachment only — never the mailbox.

CREATE TABLE IF NOT EXISTS public.email_attachment_public_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  message_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  attachment_index integer NOT NULL,
  filename text,
  content_type text,
  mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer NOT NULL DEFAULT 0
);

-- NOTE: the `token ... UNIQUE` column constraint already creates a unique index
-- on token, so no separate token index is defined here (avoids a duplicate).
CREATE INDEX IF NOT EXISTS idx_eapl_message
  ON public.email_attachment_public_links(message_id, attachment_index);
CREATE INDEX IF NOT EXISTS idx_eapl_created_by
  ON public.email_attachment_public_links(created_by);

ALTER TABLE public.email_attachment_public_links ENABLE ROW LEVEL SECURITY;

-- Only the creator manages their own links. The public download route uses the
-- service-role admin client (which bypasses RLS), so the token — not a session
-- — gates public reads. auth.uid() is wrapped in (SELECT ...) so the planner
-- evaluates it once (hardening pattern, matching the plans/goals policies).
-- Every predicate targets only this table's own created_by column, so there is
-- no cross-table or self-referential RLS recursion.
DROP POLICY IF EXISTS "own attachment links select" ON public.email_attachment_public_links;
CREATE POLICY "own attachment links select" ON public.email_attachment_public_links
  FOR SELECT USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "own attachment links insert" ON public.email_attachment_public_links;
CREATE POLICY "own attachment links insert" ON public.email_attachment_public_links
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "own attachment links update" ON public.email_attachment_public_links;
CREATE POLICY "own attachment links update" ON public.email_attachment_public_links
  FOR UPDATE USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "own attachment links delete" ON public.email_attachment_public_links;
CREATE POLICY "own attachment links delete" ON public.email_attachment_public_links
  FOR DELETE USING (created_by = (SELECT auth.uid()));

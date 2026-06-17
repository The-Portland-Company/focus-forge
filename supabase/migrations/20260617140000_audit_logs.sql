-- audit_logs — append-only record of destructive actions for org Activity.
-- Org-scoped via public.user_has_organization_access (same precedent as
-- supabase/migrations/20260603200000_domino_stakes.sql). Append-only: only
-- SELECT + INSERT policies are defined (no UPDATE/DELETE), so rows can be
-- created and read by org members but never modified or removed via the API.
-- The Settings -> Activity UI that surfaces these rows is intentionally
-- deferred; this migration only establishes the storage + access model.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Recent activity for this org" scans.
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON public.audit_logs (organization_id, created_at DESC);
-- "History for a specific entity" lookups.
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Org members may read their org's audit trail (future Activity view).
DROP POLICY IF EXISTS "audit_logs_org_select" ON public.audit_logs;
CREATE POLICY "audit_logs_org_select" ON public.audit_logs FOR SELECT
  USING (public.user_has_organization_access(organization_id));

-- Org members may append entries (best-effort writes from destructive handlers
-- run as the authed RLS-scoped client, not service-role).
DROP POLICY IF EXISTS "audit_logs_org_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_org_insert" ON public.audit_logs FOR INSERT
  WITH CHECK (public.user_has_organization_access(organization_id));

-- Append-only: intentionally no UPDATE or DELETE policies. With RLS enabled and
-- no permissive policy for those commands, all UPDATE/DELETE attempts via the
-- API are denied. (ON DELETE CASCADE from organizations still applies at the
-- table-owner level, so removing an org cleans up its audit rows.)

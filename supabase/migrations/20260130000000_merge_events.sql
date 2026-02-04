-- Merge events for organization merge + revert
CREATE TABLE IF NOT EXISTS merge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  source_organization_id UUID REFERENCES organizations(id),
  target_organization_id UUID REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'completed',
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_merge_events_source_org ON merge_events(source_organization_id);
CREATE INDEX IF NOT EXISTS idx_merge_events_target_org ON merge_events(target_organization_id);
ALTER TABLE merge_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION is_org_admin(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
DROP POLICY IF EXISTS merge_events_select ON merge_events;
DROP POLICY IF EXISTS merge_events_insert ON merge_events;
DROP POLICY IF EXISTS merge_events_update ON merge_events;
CREATE POLICY merge_events_select
  ON merge_events
  FOR SELECT
  USING (
    is_org_admin(auth.uid(), source_organization_id)
    OR is_org_admin(auth.uid(), target_organization_id)
    OR created_by = auth.uid()
  );
CREATE POLICY merge_events_insert
  ON merge_events
  FOR INSERT
  WITH CHECK (
    is_org_admin(auth.uid(), source_organization_id)
    AND is_org_admin(auth.uid(), target_organization_id)
  );
CREATE POLICY merge_events_update
  ON merge_events
  FOR UPDATE
  USING (
    is_org_admin(auth.uid(), source_organization_id)
    OR is_org_admin(auth.uid(), target_organization_id)
    OR created_by = auth.uid()
  );

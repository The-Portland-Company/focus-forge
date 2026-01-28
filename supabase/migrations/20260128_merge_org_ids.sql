-- Merge organization 9d775d70-e86d-4e50-a90f-af73b4631613 into 182e953a-7fa1-4b75-b070-30edd3776154
DO $$
DECLARE
  source_id UUID := '9d775d70-e86d-4e50-a90f-af73b4631613';
  target_id UUID := '182e953a-7fa1-4b75-b070-30edd3776154';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = source_id) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = target_id) THEN
    RETURN;
  END IF;

  UPDATE projects
  SET organization_id = target_id
  WHERE organization_id = source_id;

  INSERT INTO user_organizations (user_id, organization_id, created_at)
  SELECT user_id, target_id, created_at
  FROM user_organizations
  WHERE organization_id = source_id
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  DELETE FROM user_organizations
  WHERE organization_id = source_id;

  DELETE FROM organizations
  WHERE id = source_id;
END $$;

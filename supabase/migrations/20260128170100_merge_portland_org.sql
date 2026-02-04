-- Merge "Portland" organization into "The Portland Company"
DO $$
DECLARE
  portland_id UUID;
  tpc_id UUID;
BEGIN
  SELECT id INTO portland_id
  FROM organizations
  WHERE name = 'Portland'
  LIMIT 1;

  IF portland_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO tpc_id
  FROM organizations
  WHERE name = 'The Portland Company'
  LIMIT 1;

  IF tpc_id IS NULL THEN
    UPDATE organizations
    SET name = 'The Portland Company'
    WHERE id = portland_id;
    RETURN;
  END IF;

  UPDATE projects
  SET organization_id = tpc_id
  WHERE organization_id = portland_id;

  INSERT INTO user_organizations (user_id, organization_id, created_at)
  SELECT user_id, tpc_id, created_at
  FROM user_organizations
  WHERE organization_id = portland_id
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  DELETE FROM user_organizations
  WHERE organization_id = portland_id;

  DELETE FROM organizations
  WHERE id = portland_id;
END $$;

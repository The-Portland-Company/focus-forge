-- Create initial users using Supabase Auth Admin API approach
-- Note: Direct insertion into auth.users requires special handling

-- First, we'll create a temporary function to create users
CREATE OR REPLACE FUNCTION create_initial_users()
RETURNS void AS $$
DECLARE
  super_admin_id UUID := '00000000-0000-0000-0000-000000000001';
  demo_user_id UUID := '00000000-0000-0000-0000-000000000002';
  portland_org_id UUID := '00000000-0000-0000-0000-000000000003';
BEGIN
  -- Note: In production, users should be created via Supabase Auth API
  -- This is a migration workaround for initial setup
  
  -- Create the super admin profile manually since we can't directly insert into auth.users
  INSERT INTO profiles (id, email, first_name, last_name, role, profile_color, animations_enabled)
  VALUES (
    super_admin_id,
    'spencerdhill@protonmail.com',
    'Spencer',
    'Hill',
    'super_admin',
    '#EA580C',
    true
  ) ON CONFLICT (id) DO NOTHING;

  -- Create the demo user profile
  INSERT INTO profiles (id, email, first_name, last_name, role, profile_color, animations_enabled)
  VALUES (
    demo_user_id,
    'demo@demo.com',
    'Demo',
    'User',
    'admin',
    '#EA580C',
    true
  ) ON CONFLICT (id) DO NOTHING;

  -- Create demo organization
  INSERT INTO organizations (id, name, description, color, order_index)
  VALUES (
    portland_org_id,
    'Portland',
    'Demo organization for Portland projects',
    '#EA580C',
    0
  ) ON CONFLICT (id) DO NOTHING;

  -- Associate both users with the demo organization
  INSERT INTO user_organizations (user_id, organization_id)
  VALUES 
    (super_admin_id, portland_org_id),
    (demo_user_id, portland_org_id)
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  -- Create sample projects
  INSERT INTO projects (id, name, description, color, organization_id, order_index)
  VALUES 
    (
      '00000000-0000-0000-0000-000000000004',
      'Website Redesign',
      'Complete redesign of company website',
      '#3B82F6',
      portland_org_id,
      0
    ),
    (
      '00000000-0000-0000-0000-000000000005',
      'Mobile App Development',
      'Develop iOS and Android mobile apps',
      '#10B981',
      portland_org_id,
      1
    )
  ON CONFLICT (id) DO NOTHING;

  -- Create sample tags
  INSERT INTO tags (id, name, color)
  VALUES 
    ('00000000-0000-0000-0000-000000000006', 'urgent', '#EF4444'),
    ('00000000-0000-0000-0000-000000000007', 'design', '#8B5CF6'),
    ('00000000-0000-0000-0000-000000000008', 'development', '#3B82F6')
  ON CONFLICT (id) DO NOTHING;

  -- Create sample tasks
  INSERT INTO tasks (id, name, description, project_id, priority)
  VALUES 
    (
      '00000000-0000-0000-0000-000000000009',
      'Create wireframes',
      'Design initial wireframes for all pages',
      '00000000-0000-0000-0000-000000000004',
      2
    ),
    (
      '00000000-0000-0000-0000-000000000010',
      'Set up development environment',
      'Configure React Native development environment',
      '00000000-0000-0000-0000-000000000005',
      1
    )
  ON CONFLICT (id) DO NOTHING;

  -- Add tags to tasks
  INSERT INTO task_tags (task_id, tag_id)
  VALUES 
    ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000007'),
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000006'),
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000008')
  ON CONFLICT (task_id, tag_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT create_initial_users();

-- Drop the temporary function
DROP FUNCTION create_initial_users();

-- Add a comment explaining the user creation process
COMMENT ON TABLE profiles IS 'User profiles table. Note: Actual user authentication records must be created via Supabase Auth API. The initial users created here are profile records only. Use the following credentials in Supabase Dashboard:
- Super Admin: spencerdhill@protonmail.com / ***REMOVED***
- Demo Admin: demo@demo.com / Demo';
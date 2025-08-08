-- Seed data for initial users and demo organization
-- Note: This seed file creates test users and sample data

-- Create super admin user (password: ***REMOVED***)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'spencerdhill@protonmail.com',
  crypt('***REMOVED***', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  true,
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Create demo user (password: Demo)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'demo@demo.com',
  crypt('Demo', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false,
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Update profiles with correct roles (the trigger should have created these)
UPDATE profiles SET 
  role = 'super_admin',
  first_name = 'Spencer',
  last_name = 'Hill'
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE profiles SET 
  role = 'admin',
  first_name = 'Demo',
  last_name = 'User'
WHERE id = '00000000-0000-0000-0000-000000000002';

-- Create demo organization
INSERT INTO organizations (id, name, description, color, order_index, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Portland',
  'Demo organization for Portland projects',
  '#EA580C',
  0,
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- Associate both users with the demo organization
INSERT INTO user_organizations (user_id, organization_id, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', now())
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Create sample projects
INSERT INTO projects (id, name, description, color, organization_id, order_index, created_at, updated_at)
VALUES 
  (
    '00000000-0000-0000-0000-000000000004',
    'Website Redesign',
    'Complete redesign of company website',
    '#3B82F6',
    '00000000-0000-0000-0000-000000000003',
    0,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'Mobile App Development',
    'Develop iOS and Android mobile apps',
    '#10B981',
    '00000000-0000-0000-0000-000000000003',
    1,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- Create sample tags
INSERT INTO tags (id, name, color, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000006', 'urgent', '#EF4444', now()),
  ('00000000-0000-0000-0000-000000000007', 'design', '#8B5CF6', now()),
  ('00000000-0000-0000-0000-000000000008', 'development', '#3B82F6', now())
ON CONFLICT (id) DO NOTHING;

-- Create sample tasks
INSERT INTO tasks (id, name, description, project_id, priority, created_at, updated_at)
VALUES 
  (
    '00000000-0000-0000-0000-000000000009',
    'Create wireframes',
    'Design initial wireframes for all pages',
    '00000000-0000-0000-0000-000000000004',
    2,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000010',
    'Set up development environment',
    'Configure React Native development environment',
    '00000000-0000-0000-0000-000000000005',
    1,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- Add tags to tasks
INSERT INTO task_tags (task_id, tag_id)
VALUES 
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000007'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000006'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000008')
ON CONFLICT (task_id, tag_id) DO NOTHING;
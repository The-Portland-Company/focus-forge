-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'team_member');
CREATE TYPE reminder_type AS ENUM ('preset', 'custom');
CREATE TYPE reminder_unit AS ENUM ('minutes', 'hours', 'days', 'weeks', 'months', 'years');

-- Create profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role user_role NOT NULL DEFAULT 'team_member',
  profile_color TEXT DEFAULT '#EA580C',
  profile_memoji TEXT,
  animations_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#EA580C',
  archived BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_organizations junction table
CREATE TABLE user_organizations (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  is_owner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

-- Create projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#EA580C',
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  is_favorite BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  budget DECIMAL,
  deadline TIMESTAMPTZ,
  order_index INTEGER DEFAULT 0,
  todoist_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  due_time TIME,
  priority INTEGER DEFAULT 4 CHECK (priority BETWEEN 1 AND 4),
  deadline TIMESTAMPTZ,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id),
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  todoist_id TEXT,
  recurring_pattern TEXT,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  indent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tags table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#EA580C',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create task_tags junction table
CREATE TABLE task_tags (
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

-- Create reminders table
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  type reminder_type NOT NULL,
  value TEXT NOT NULL,
  unit reminder_unit,
  amount INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create attachments table
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_projects_organization_id ON projects(organization_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX idx_task_tags_task_id ON task_tags(task_id);
CREATE INDEX idx_task_tags_tag_id ON task_tags(tag_id);
CREATE INDEX idx_reminders_task_id ON reminders(task_id);
CREATE INDEX idx_attachments_task_id ON attachments(task_id);
CREATE INDEX idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX idx_user_organizations_organization_id ON user_organizations(organization_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Create function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user belongs to organization
CREATE OR REPLACE FUNCTION user_has_organization_access(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_organizations 
    WHERE user_id = auth.uid() 
    AND organization_id = org_id
  ) OR is_super_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user is admin in organization
CREATE OR REPLACE FUNCTION user_is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_organizations uo
    JOIN profiles p ON p.id = uo.user_id
    WHERE uo.user_id = auth.uid()
      AND uo.organization_id = org_id
      AND p.role IN ('admin', 'super_admin')
  ) OR is_super_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Super admins can view all profiles" ON profiles
  FOR SELECT USING (is_super_admin());

-- RLS Policies for organizations
CREATE POLICY "Users can view their organizations" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_organizations 
      WHERE user_id = auth.uid() 
      AND organization_id = organizations.id
    ) OR is_super_admin()
  );

CREATE POLICY "Super admins can manage all organizations" ON organizations
  FOR ALL USING (is_super_admin());

CREATE POLICY "Admins can update their organizations" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_organizations uo
      JOIN profiles p ON p.id = uo.user_id
      WHERE uo.user_id = auth.uid() 
      AND uo.organization_id = organizations.id
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for user_organizations
CREATE POLICY "Users can view their own associations" ON user_organizations
  FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Admins can view all users in their organizations" ON user_organizations
  FOR SELECT USING (
    user_is_org_admin(user_organizations.organization_id)
  );

CREATE POLICY "Admins can add users to their organizations" ON user_organizations
  FOR INSERT WITH CHECK (
    user_is_org_admin(user_organizations.organization_id)
  );

CREATE POLICY "Admins can remove users from their organizations" ON user_organizations
  FOR DELETE USING (
    user_is_org_admin(user_organizations.organization_id)
  );

-- RLS Policies for projects
CREATE POLICY "Users can view projects in their organizations" ON projects
  FOR SELECT USING (user_has_organization_access(organization_id));

CREATE POLICY "Admins can manage projects in their organizations" ON projects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_organizations uo ON uo.user_id = p.id
      WHERE p.id = auth.uid()
      AND uo.organization_id = projects.organization_id
      AND p.role IN ('admin', 'super_admin')
    ) OR is_super_admin()
  );

CREATE POLICY "Team members can update projects in their organizations" ON projects
  FOR UPDATE USING (user_has_organization_access(organization_id));

-- RLS Policies for tasks
CREATE POLICY "Users can view tasks in their projects" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id
      AND user_has_organization_access(p.organization_id)
    )
  );

CREATE POLICY "Users can manage tasks in their projects" ON tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id
      AND user_has_organization_access(p.organization_id)
    )
  );

-- RLS Policies for tags (global access for all authenticated users)
CREATE POLICY "All users can view tags" ON tags
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can create tags" ON tags
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for task_tags
CREATE POLICY "Users can view task tags for their tasks" ON task_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = task_tags.task_id
      AND user_has_organization_access(p.organization_id)
    )
  );

CREATE POLICY "Users can manage task tags for their tasks" ON task_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = task_tags.task_id
      AND user_has_organization_access(p.organization_id)
    )
  );

-- RLS Policies for reminders
CREATE POLICY "Users can view reminders for their tasks" ON reminders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = reminders.task_id
      AND user_has_organization_access(p.organization_id)
    )
  );

CREATE POLICY "Users can manage reminders for their tasks" ON reminders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = reminders.task_id
      AND user_has_organization_access(p.organization_id)
    )
  );

-- RLS Policies for attachments
CREATE POLICY "Users can view attachments for their tasks" ON attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = attachments.task_id
      AND user_has_organization_access(p.organization_id)
    )
  );

CREATE POLICY "Users can manage attachments for their tasks" ON attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = attachments.task_id
      AND user_has_organization_access(p.organization_id)
    )
  );

-- Create trigger to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create user_preferences table for UI state
CREATE TABLE user_preferences (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  expanded_organizations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS for user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preferences
CREATE POLICY "Users can view their own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

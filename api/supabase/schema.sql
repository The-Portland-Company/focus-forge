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
  dock_badge_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Independent, per-user AI model waterfall chains (quality-first ordering).
  -- { estimator: string[], assistant: string[] } of known model ids.
  ai_model_chains JSONB NOT NULL DEFAULT '{"estimator":["claude-opus-4-8","gpt-4.1","claude-sonnet-4-6","grok-3"],"assistant":["claude-opus-4-8","gpt-4.1","claude-sonnet-4-6","grok-3"]}'::jsonb,
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
  devnotes_meta TEXT,
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
  devnotes_meta TEXT,
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

-- ============================================================================
-- ENTITY VERSIONING (soft delete + event log)
-- Applied via supabase/migrations/20260603190000_entity_versioning.sql
-- Columns: organizations/projects/sections/tasks gain deleted_at TIMESTAMPTZ
-- and delete_batch_id UUID. Table entity_events is the immutable audit log.
-- Functions: log_entity_event() trigger, soft_delete_entity(), restore_entity().
-- See that migration file for the canonical DDL (kept in one place to avoid drift).
-- ============================================================================

-- ============================================================================
-- AI MEMORY (retrieval memory + playbooks + decision traces)
-- Applied via supabase/migrations/20260607000000_ai_memory.sql (canonical DDL).
-- Tables: ai_memory_events, ai_memories (pgvector embedding), ai_playbooks,
-- ai_decision_traces. RPC: match_ai_memories(). RLS: own-user + org-scoped.
-- ============================================================================

-- ============================================================================
-- DOMINO EFFECT (stakes, chains & weighted scheduling)
-- Applied via supabase/migrations/20260603200000_domino_stakes.sql (canonical DDL).
-- Tables: stakes, stake_edges, task_stakes, stake_extraction_examples.
-- All soft-delete (deleted_at, delete_batch_id) per entity_versioning precedent.
-- stake_edges has a BEFORE INSERT cycle-rejection trigger (WITH RECURSIVE).
-- RLS: stakes via user_has_organization_access(organization_id); edges/links via
-- EXISTS join to the parent/linked stake's org; examples via auth.uid() = user_id.
-- DDL mirrored below; see the migration for the authoritative version.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('consequence', 'reward')),
  name TEXT NOT NULL,
  description TEXT,
  monetary_value NUMERIC CHECK (monetary_value IS NULL OR monetary_value >= 0),
  severity TEXT CHECK (severity IS NULL OR severity IN ('minor', 'moderate', 'severe', 'critical')),
  trigger_at TIMESTAMPTZ,
  recurrence TEXT,
  recurrence_interval_days INTEGER CHECK (recurrence_interval_days IS NULL OR recurrence_interval_days > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'defused', 'eliminated', 'expired')),
  deleted_at TIMESTAMPTZ,
  delete_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stakes_organization_id ON public.stakes (organization_id);
CREATE INDEX IF NOT EXISTS idx_stakes_project_id ON public.stakes (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stakes_deleted_at ON public.stakes (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stakes_delete_batch ON public.stakes (delete_batch_id) WHERE delete_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stakes_active_trigger_at
  ON public.stakes (trigger_at)
  WHERE status = 'active' AND deleted_at IS NULL;

ALTER TABLE public.stakes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stake_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_stake_id UUID NOT NULL REFERENCES public.stakes(id) ON DELETE CASCADE,
  child_stake_id UUID NOT NULL REFERENCES public.stakes(id) ON DELETE CASCADE,
  weight_multiplier NUMERIC NOT NULL DEFAULT 0.7,
  deleted_at TIMESTAMPTZ,
  delete_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stake_edges_no_self CHECK (parent_stake_id <> child_stake_id),
  CONSTRAINT stake_edges_unique UNIQUE (parent_stake_id, child_stake_id)
);

CREATE INDEX IF NOT EXISTS idx_stake_edges_parent ON public.stake_edges (parent_stake_id);
CREATE INDEX IF NOT EXISTS idx_stake_edges_child ON public.stake_edges (child_stake_id);
CREATE INDEX IF NOT EXISTS idx_stake_edges_deleted_at ON public.stake_edges (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stake_edges_delete_batch ON public.stake_edges (delete_batch_id) WHERE delete_batch_id IS NOT NULL;

ALTER TABLE public.stake_edges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.task_stakes (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  stake_id UUID NOT NULL REFERENCES public.stakes(id) ON DELETE CASCADE,
  resolution_type TEXT NOT NULL CHECK (resolution_type IN ('defuses_once', 'eliminates')),
  deleted_at TIMESTAMPTZ,
  delete_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, stake_id)
);

CREATE INDEX IF NOT EXISTS idx_task_stakes_task ON public.task_stakes (task_id);
CREATE INDEX IF NOT EXISTS idx_task_stakes_stake ON public.task_stakes (stake_id);
CREATE INDEX IF NOT EXISTS idx_task_stakes_deleted_at ON public.task_stakes (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_stakes_delete_batch ON public.task_stakes (delete_batch_id) WHERE delete_batch_id IS NOT NULL;

ALTER TABLE public.task_stakes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stake_extraction_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_input TEXT NOT NULL,
  accepted_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stake_extraction_examples_user_created
  ON public.stake_extraction_examples (user_id, created_at DESC);

ALTER TABLE public.stake_extraction_examples ENABLE ROW LEVEL SECURITY;

-- daily_plan_cache — server-side per-user/day cache of the generated Daily Plan.
CREATE TABLE IF NOT EXISTS public.daily_plan_cache (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_date)
);

ALTER TABLE public.daily_plan_cache ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_daily_plan_cache_updated_at ON public.daily_plan_cache;
CREATE TRIGGER update_daily_plan_cache_updated_at BEFORE UPDATE ON public.daily_plan_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- audit_logs — append-only record of destructive actions for org Activity.
-- See supabase/migrations/20260617140000_audit_logs.sql.
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_org_select" ON public.audit_logs;
CREATE POLICY "audit_logs_org_select" ON public.audit_logs FOR SELECT
  USING (public.user_has_organization_access(organization_id));

DROP POLICY IF EXISTS "audit_logs_org_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_org_insert" ON public.audit_logs FOR INSERT
  WITH CHECK (public.user_has_organization_access(organization_id));
-- Append-only: no UPDATE/DELETE policies (denied with RLS enabled).

-- AI estimator training set (per-user, HITL-curatable). Source migrations:
--   20260602200000_task_time_estimate.sql (base table + select/insert/delete RLS)
--   20260618000000_estimate_examples_hitl.sql (source, updated_at, UPDATE RLS)
CREATE TABLE IF NOT EXISTS public.task_estimate_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  task_name TEXT NOT NULL,
  task_description TEXT,
  project_name TEXT,
  tags TEXT[],
  priority INTEGER,
  ai_suggested_minutes INTEGER,
  ai_confidence TEXT,
  accepted_minutes INTEGER NOT NULL CHECK (accepted_minutes BETWEEN 1 AND 480),
  source TEXT NOT NULL DEFAULT 'accepted'
    CHECK (source IN ('accepted', 'manual', 'edited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_estimate_examples_user_created_idx
  ON public.task_estimate_examples (user_id, created_at DESC);

ALTER TABLE public.task_estimate_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_estimate_examples_own_select" ON public.task_estimate_examples;
CREATE POLICY "task_estimate_examples_own_select" ON public.task_estimate_examples FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "task_estimate_examples_own_insert" ON public.task_estimate_examples;
CREATE POLICY "task_estimate_examples_own_insert" ON public.task_estimate_examples FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "task_estimate_examples_own_update" ON public.task_estimate_examples;
CREATE POLICY "task_estimate_examples_own_update" ON public.task_estimate_examples FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "task_estimate_examples_own_delete" ON public.task_estimate_examples;
CREATE POLICY "task_estimate_examples_own_delete" ON public.task_estimate_examples FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_task_estimate_examples_updated_at ON public.task_estimate_examples;
CREATE TRIGGER update_task_estimate_examples_updated_at
  BEFORE UPDATE ON public.task_estimate_examples
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

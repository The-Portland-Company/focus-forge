-- Sentry Integration Schema Updates
-- Adds Sentry connector support: profile config, per-project connections, and
-- external issue references on tasks. Mirrors the Todoist integration style.

-- Add Sentry-specific columns to profiles (if not already present)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS sentry_auth_token TEXT,
ADD COLUMN IF NOT EXISTS sentry_org_slug TEXT,
ADD COLUMN IF NOT EXISTS sentry_base_url TEXT DEFAULT 'https://sentry.io',
ADD COLUMN IF NOT EXISTS sentry_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sentry_webhook_secret TEXT;

-- Add Sentry external references to tasks
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS sentry_issue_id TEXT,
ADD COLUMN IF NOT EXISTS sentry_org_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_sentry_issue_id ON tasks(sentry_issue_id);

-- Create Sentry connections table (maps a Sentry project to a Forge project)
CREATE TABLE IF NOT EXISTS sentry_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sentry_project_slug TEXT NOT NULL,
  sentry_org_slug TEXT NOT NULL,
  forge_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, sentry_org_slug, sentry_project_slug)
);

CREATE INDEX IF NOT EXISTS idx_sentry_connections_user_id ON sentry_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_sentry_connections_forge_project_id ON sentry_connections(forge_project_id);

-- Enable RLS (owner-only)
ALTER TABLE sentry_connections ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist (rerun-safe)
DROP POLICY IF EXISTS "Users can view their own sentry connections" ON sentry_connections;
DROP POLICY IF EXISTS "Users can manage their own sentry connections" ON sentry_connections;

CREATE POLICY "Users can view their own sentry connections" ON sentry_connections
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own sentry connections" ON sentry_connections
  FOR ALL USING (user_id = auth.uid());

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_sentry_connections_updated_at ON sentry_connections;
CREATE TRIGGER update_sentry_connections_updated_at BEFORE UPDATE ON sentry_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

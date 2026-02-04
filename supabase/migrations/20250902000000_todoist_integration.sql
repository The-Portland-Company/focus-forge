-- Todoist Integration Schema Updates
-- This migration adds comprehensive support for bidirectional Todoist sync

-- Add Todoist-specific columns to existing tables (if not already present)
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS todoist_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS todoist_sync_token TEXT,
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_todoist_sync TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS todoist_order INTEGER,
ADD COLUMN IF NOT EXISTS todoist_child_order INTEGER,
ADD COLUMN IF NOT EXISTS todoist_collapsed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_labels TEXT[],
ADD COLUMN IF NOT EXISTS todoist_assignee_id TEXT,
ADD COLUMN IF NOT EXISTS todoist_assigner_id TEXT,
ADD COLUMN IF NOT EXISTS todoist_comment_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS todoist_url TEXT,
ADD COLUMN IF NOT EXISTS todoist_duration_amount INTEGER,
ADD COLUMN IF NOT EXISTS todoist_duration_unit TEXT;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS todoist_sync_token TEXT,
ADD COLUMN IF NOT EXISTS todoist_parent_id TEXT,
ADD COLUMN IF NOT EXISTS todoist_child_order INTEGER,
ADD COLUMN IF NOT EXISTS todoist_collapsed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_shared BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_is_favorite BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_sync_id TEXT,
ADD COLUMN IF NOT EXISTS todoist_view_style TEXT DEFAULT 'list',
ADD COLUMN IF NOT EXISTS last_todoist_sync TIMESTAMPTZ;

ALTER TABLE tags
ADD COLUMN IF NOT EXISTS todoist_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS todoist_order INTEGER,
ADD COLUMN IF NOT EXISTS todoist_is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_is_favorite BOOLEAN DEFAULT false;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS todoist_api_token TEXT,
ADD COLUMN IF NOT EXISTS todoist_user_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS todoist_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_auto_sync BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS todoist_sync_frequency INTEGER DEFAULT 5, -- minutes
ADD COLUMN IF NOT EXISTS todoist_premium BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS todoist_email TEXT,
ADD COLUMN IF NOT EXISTS todoist_full_name TEXT,
ADD COLUMN IF NOT EXISTS todoist_timezone TEXT,
ADD COLUMN IF NOT EXISTS todoist_start_page TEXT,
ADD COLUMN IF NOT EXISTS todoist_start_day INTEGER,
ADD COLUMN IF NOT EXISTS todoist_karma INTEGER,
ADD COLUMN IF NOT EXISTS todoist_karma_trend TEXT;

-- Create Todoist sync state table
CREATE TABLE IF NOT EXISTS todoist_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sync_token TEXT,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  sync_status TEXT CHECK (sync_status IN ('idle', 'syncing', 'completed', 'failed')),
  error_message TEXT,
  error_count INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create Todoist sync history table for audit trail
CREATE TABLE IF NOT EXISTS todoist_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sync_type TEXT CHECK (sync_type IN ('full', 'incremental', 'manual')),
  sync_direction TEXT CHECK (sync_direction IN ('pull', 'push', 'bidirectional')),
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_deleted INTEGER DEFAULT 0,
  projects_created INTEGER DEFAULT 0,
  projects_updated INTEGER DEFAULT 0,
  projects_deleted INTEGER DEFAULT 0,
  tags_synced INTEGER DEFAULT 0,
  conflicts_resolved INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_details JSONB,
  sync_token_before TEXT,
  sync_token_after TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create comments table for new comment system
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  todoist_id TEXT UNIQUE,
  todoist_posted_at TIMESTAMPTZ,
  todoist_attachment JSONB,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT comment_parent CHECK (
    (task_id IS NOT NULL AND project_id IS NULL) OR 
    (task_id IS NULL AND project_id IS NOT NULL)
  )
);

-- Enhance attachments table for better file support
ALTER TABLE attachments
ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS todoist_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS todoist_upload_state TEXT,
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase',
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create conflict resolution table
CREATE TABLE IF NOT EXISTS todoist_sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  resource_type TEXT CHECK (resource_type IN ('task', 'project', 'tag', 'comment')),
  resource_id UUID,
  todoist_id TEXT,
  local_data JSONB,
  todoist_data JSONB,
  local_updated_at TIMESTAMPTZ,
  todoist_updated_at TIMESTAMPTZ,
  resolution_strategy TEXT CHECK (resolution_strategy IN ('local_wins', 'todoist_wins', 'manual', 'merged')),
  resolution_data JSONB,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create backup table for initial import
CREATE TABLE IF NOT EXISTS todoist_import_backup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  backup_type TEXT CHECK (backup_type IN ('pre_import', 'pre_disconnect', 'manual')),
  data JSONB NOT NULL,
  item_count INTEGER,
  project_count INTEGER,
  tag_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for tracking Todoist API calls (for rate limiting)
CREATE TABLE IF NOT EXISTS todoist_api_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create filters table for Todoist filters sync
CREATE TABLE IF NOT EXISTS filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  color TEXT,
  todoist_id TEXT UNIQUE,
  todoist_order INTEGER,
  is_deleted BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sections table for project sections
CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  todoist_id TEXT UNIQUE,
  todoist_order INTEGER,
  todoist_collapsed BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add section reference to tasks
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE SET NULL;

-- Create activity log table for sync activity tracking
CREATE TABLE IF NOT EXISTS todoist_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  todoist_id TEXT,
  extra_data JSONB,
  todoist_event_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_todoist_id ON tasks(todoist_id);
CREATE INDEX IF NOT EXISTS idx_projects_todoist_id ON projects(todoist_id);
CREATE INDEX IF NOT EXISTS idx_tags_todoist_id ON tags(todoist_id);
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_sections_project_id ON sections(project_id);
CREATE INDEX IF NOT EXISTS idx_sections_todoist_id ON sections(todoist_id);
CREATE INDEX IF NOT EXISTS idx_tasks_section_id ON tasks(section_id);
CREATE INDEX IF NOT EXISTS idx_filters_user_id ON filters(user_id);
CREATE INDEX IF NOT EXISTS idx_filters_todoist_id ON filters(todoist_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_user_id ON todoist_sync_state(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_user_id ON todoist_sync_history(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_started_at ON todoist_sync_history(started_at);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_user_id ON todoist_sync_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved_at ON todoist_sync_conflicts(resolved_at);
CREATE INDEX IF NOT EXISTS idx_api_calls_user_id ON todoist_api_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_created_at ON todoist_api_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON todoist_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON todoist_activity_log(created_at);

-- Enable RLS on new tables
ALTER TABLE todoist_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE todoist_sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE todoist_sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE todoist_import_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE todoist_api_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE todoist_activity_log ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist (rerun-safe)
DROP POLICY IF EXISTS "Users can view their own sync state" ON todoist_sync_state;
DROP POLICY IF EXISTS "Users can manage their own sync state" ON todoist_sync_state;
DROP POLICY IF EXISTS "Users can view their own sync history" ON todoist_sync_history;
DROP POLICY IF EXISTS "Users can create their own sync history" ON todoist_sync_history;
DROP POLICY IF EXISTS "Users can view comments on their tasks" ON comments;
DROP POLICY IF EXISTS "Users can manage comments on their tasks" ON comments;
DROP POLICY IF EXISTS "Users can view their own sync conflicts" ON todoist_sync_conflicts;
DROP POLICY IF EXISTS "Users can manage their own sync conflicts" ON todoist_sync_conflicts;
DROP POLICY IF EXISTS "Users can view their own backups" ON todoist_import_backup;
DROP POLICY IF EXISTS "Users can create their own backups" ON todoist_import_backup;
DROP POLICY IF EXISTS "Users can view their own API calls" ON todoist_api_calls;
DROP POLICY IF EXISTS "Users can log their own API calls" ON todoist_api_calls;
DROP POLICY IF EXISTS "Users can view their own filters" ON filters;
DROP POLICY IF EXISTS "Users can manage their own filters" ON filters;
DROP POLICY IF EXISTS "Users can view sections in their projects" ON sections;
DROP POLICY IF EXISTS "Users can manage sections in their projects" ON sections;
DROP POLICY IF EXISTS "Users can view their own activity log" ON todoist_activity_log;
DROP POLICY IF EXISTS "Users can create their own activity log" ON todoist_activity_log;

-- RLS Policies for todoist_sync_state
CREATE POLICY "Users can view their own sync state" ON todoist_sync_state
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own sync state" ON todoist_sync_state
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for todoist_sync_history
CREATE POLICY "Users can view their own sync history" ON todoist_sync_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own sync history" ON todoist_sync_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for comments
CREATE POLICY "Users can view comments on their tasks" ON comments
  FOR SELECT USING (
    (task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = comments.task_id
      AND user_has_organization_access(p.organization_id)
    )) OR
    (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = comments.project_id
      AND user_has_organization_access(p.organization_id)
    ))
  );

CREATE POLICY "Users can manage comments on their tasks" ON comments
  FOR ALL USING (
    (task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = comments.task_id
      AND user_has_organization_access(p.organization_id)
    )) OR
    (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = comments.project_id
      AND user_has_organization_access(p.organization_id)
    ))
  );

-- RLS Policies for todoist_sync_conflicts
CREATE POLICY "Users can view their own sync conflicts" ON todoist_sync_conflicts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own sync conflicts" ON todoist_sync_conflicts
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for todoist_import_backup
CREATE POLICY "Users can view their own backups" ON todoist_import_backup
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own backups" ON todoist_import_backup
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for todoist_api_calls
CREATE POLICY "Users can view their own API calls" ON todoist_api_calls
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can log their own API calls" ON todoist_api_calls
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for filters
CREATE POLICY "Users can view their own filters" ON filters
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own filters" ON filters
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for sections
CREATE POLICY "Users can view sections in their projects" ON sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = sections.project_id
      AND user_has_organization_access(p.organization_id)
    )
  );

CREATE POLICY "Users can manage sections in their projects" ON sections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = sections.project_id
      AND user_has_organization_access(p.organization_id)
    )
  );

-- RLS Policies for todoist_activity_log
CREATE POLICY "Users can view their own activity log" ON todoist_activity_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own activity log" ON todoist_activity_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Add updated_at triggers for new tables
DROP TRIGGER IF EXISTS update_todoist_sync_state_updated_at ON todoist_sync_state;
DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
DROP TRIGGER IF EXISTS update_attachments_updated_at ON attachments;
DROP TRIGGER IF EXISTS update_filters_updated_at ON filters;
DROP TRIGGER IF EXISTS update_sections_updated_at ON sections;

CREATE TRIGGER update_todoist_sync_state_updated_at BEFORE UPDATE ON todoist_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attachments_updated_at BEFORE UPDATE ON attachments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_filters_updated_at BEFORE UPDATE ON filters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to check for sync conflicts
CREATE OR REPLACE FUNCTION check_sync_conflict(
  p_resource_type TEXT,
  p_resource_id UUID,
  p_local_updated_at TIMESTAMPTZ,
  p_todoist_updated_at TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
BEGIN
  -- If both were updated within 1 minute of each other, consider it a conflict
  RETURN ABS(EXTRACT(EPOCH FROM (p_local_updated_at - p_todoist_updated_at))) < 60;
END;
$$ LANGUAGE plpgsql;

-- Create function to get next sync time
CREATE OR REPLACE FUNCTION get_next_sync_time(p_user_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_sync_frequency INTEGER;
BEGIN
  SELECT todoist_sync_frequency INTO v_sync_frequency
  FROM profiles
  WHERE id = p_user_id;
  
  RETURN NOW() + (v_sync_frequency || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Create function to log API call
CREATE OR REPLACE FUNCTION log_todoist_api_call(
  p_user_id UUID,
  p_endpoint TEXT,
  p_method TEXT,
  p_status_code INTEGER DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_call_id UUID;
BEGIN
  INSERT INTO todoist_api_calls (
    user_id, endpoint, method, status_code, response_time_ms, error_message
  ) VALUES (
    p_user_id, p_endpoint, p_method, p_status_code, p_response_time_ms, p_error_message
  ) RETURNING id INTO v_call_id;
  
  RETURN v_call_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to check rate limits
CREATE OR REPLACE FUNCTION check_todoist_rate_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_recent_calls INTEGER;
BEGIN
  -- Check if user has made more than 450 calls in the last minute (Todoist limit is 450/min)
  SELECT COUNT(*) INTO v_recent_calls
  FROM todoist_api_calls
  WHERE user_id = p_user_id
  AND created_at > NOW() - INTERVAL '1 minute';
  
  RETURN v_recent_calls < 450;
END;
$$ LANGUAGE plpgsql;

-- Create function to backup user data before import
CREATE OR REPLACE FUNCTION backup_before_todoist_import(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_backup_id UUID;
  v_backup_data JSONB;
  v_item_count INTEGER;
  v_project_count INTEGER;
  v_tag_count INTEGER;
BEGIN
  -- Gather all user data
  WITH user_data AS (
    SELECT 
      (SELECT json_agg(t.*) FROM tasks t 
       JOIN projects p ON p.id = t.project_id
       JOIN user_organizations uo ON uo.organization_id = p.organization_id
       WHERE uo.user_id = p_user_id) as tasks,
      (SELECT json_agg(p.*) FROM projects p
       JOIN user_organizations uo ON uo.organization_id = p.organization_id
       WHERE uo.user_id = p_user_id) as projects,
      (SELECT json_agg(tg.*) FROM tags tg) as tags
  )
  SELECT row_to_json(user_data.*) INTO v_backup_data FROM user_data;
  
  -- Count items
  SELECT COUNT(*) INTO v_item_count FROM tasks t
  JOIN projects p ON p.id = t.project_id
  JOIN user_organizations uo ON uo.organization_id = p.organization_id
  WHERE uo.user_id = p_user_id;
  
  SELECT COUNT(*) INTO v_project_count FROM projects p
  JOIN user_organizations uo ON uo.organization_id = p.organization_id
  WHERE uo.user_id = p_user_id;
  
  SELECT COUNT(*) INTO v_tag_count FROM tags;
  
  -- Create backup
  INSERT INTO todoist_import_backup (
    user_id, backup_type, data, item_count, project_count, tag_count
  ) VALUES (
    p_user_id, 'pre_import', v_backup_data, v_item_count, v_project_count, v_tag_count
  ) RETURNING id INTO v_backup_id;
  
  RETURN v_backup_id;
END;
$$ LANGUAGE plpgsql;

-- Add helper view for upcoming recurring tasks
CREATE OR REPLACE VIEW upcoming_recurring_tasks AS
SELECT 
  t.*,
  CASE 
    WHEN t.recurring_pattern LIKE 'every day%' THEN t.due_date + INTERVAL '1 day'
    WHEN t.recurring_pattern LIKE 'every week%' THEN t.due_date + INTERVAL '1 week'
    WHEN t.recurring_pattern LIKE 'every month%' THEN t.due_date + INTERVAL '1 month'
    WHEN t.recurring_pattern LIKE 'every year%' THEN t.due_date + INTERVAL '1 year'
    ELSE t.due_date
  END as next_due_date
FROM tasks t
WHERE t.is_recurring = true
AND t.completed = false;

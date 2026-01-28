-- Todoist Integration and Missing Tables Migration
-- Run this in your Supabase SQL Editor

-- Add Todoist fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_api_token text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_user_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_sync_enabled boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_auto_sync boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_sync_frequency integer DEFAULT 30;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_premium boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_full_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS todoist_timezone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_todoist_sync timestamp with time zone;

-- Create sections table
CREATE TABLE IF NOT EXISTS sections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES sections(id) ON DELETE CASCADE,
    color text DEFAULT '#EA580C',
    description text,
    icon text,
    order_index integer DEFAULT 0,
    todoist_id text,
    todoist_order integer,
    todoist_collapsed boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create task_sections junction table
CREATE TABLE IF NOT EXISTS task_sections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
    section_id uuid REFERENCES sections(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(task_id, section_id)
);

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    user_name text,
    content text NOT NULL,
    todoist_id text,
    todoist_posted_at timestamptz,
    todoist_attachment jsonb,
    is_deleted boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CHECK (task_id IS NOT NULL OR project_id IS NOT NULL)
);

-- Create todoist_sync_state table
CREATE TABLE IF NOT EXISTS todoist_sync_state (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
    sync_token text,
    full_sync boolean DEFAULT true,
    last_sync_at timestamptz,
    next_sync_at timestamptz,
    status text DEFAULT 'idle' CHECK (status IN ('idle', 'syncing', 'error')),
    error_message text,
    error_count integer DEFAULT 0,
    consecutive_failures integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create todoist_sync_history table
CREATE TABLE IF NOT EXISTS todoist_sync_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    sync_type text CHECK (sync_type IN ('full', 'incremental')),
    started_at timestamptz NOT NULL,
    completed_at timestamptz,
    items_created integer DEFAULT 0,
    items_updated integer DEFAULT 0,
    items_deleted integer DEFAULT 0,
    projects_created integer DEFAULT 0,
    projects_updated integer DEFAULT 0,
    projects_deleted integer DEFAULT 0,
    conflicts_found integer DEFAULT 0,
    conflicts_resolved integer DEFAULT 0,
    errors text[],
    sync_token text,
    created_at timestamptz DEFAULT now()
);

-- Create todoist_sync_conflicts table
CREATE TABLE IF NOT EXISTS todoist_sync_conflicts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    entity_type text CHECK (entity_type IN ('task', 'project', 'section', 'comment')),
    entity_id uuid,
    todoist_id text,
    local_data jsonb,
    remote_data jsonb,
    conflict_type text CHECK (conflict_type IN ('update_conflict', 'delete_conflict')),
    resolution text CHECK (resolution IN ('keep_local', 'keep_remote', 'merge', 'pending')),
    resolved_at timestamptz,
    resolved_by uuid REFERENCES profiles(id),
    created_at timestamptz DEFAULT now()
);

-- Add Todoist fields to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS todoist_order integer;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS todoist_labels text[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS todoist_assignee_id text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS todoist_assigner_id text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS todoist_comment_count integer DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS todoist_url text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS todoist_sync_token text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_todoist_sync timestamptz;

-- Add Todoist fields to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS todoist_sync_token text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS todoist_parent_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS todoist_child_order integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS todoist_shared boolean DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS todoist_view_style text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_todoist_sync timestamptz;

-- Add Todoist fields to tags table
ALTER TABLE tags ADD COLUMN IF NOT EXISTS todoist_id text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS todoist_order integer;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS todoist_is_favorite boolean DEFAULT false;

-- Add Todoist fields to attachments table
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS todoist_id text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS storage_provider text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_section_id ON tasks(section_id);
CREATE INDEX IF NOT EXISTS idx_tasks_todoist_id ON tasks(todoist_id);
CREATE INDEX IF NOT EXISTS idx_projects_todoist_id ON projects(todoist_id);
CREATE INDEX IF NOT EXISTS idx_sections_project_id ON sections(project_id);
CREATE INDEX IF NOT EXISTS idx_sections_todoist_id ON sections(todoist_id);
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_todoist_sync_state_user_id ON todoist_sync_state(user_id);
CREATE INDEX IF NOT EXISTS idx_todoist_sync_history_user_id ON todoist_sync_history(user_id);

-- Enable RLS on new tables
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE todoist_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE todoist_sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE todoist_sync_conflicts ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist (rerun-safe)
DROP POLICY IF EXISTS "Users can view sections in their projects" ON sections;
DROP POLICY IF EXISTS "Users can create sections in their projects" ON sections;
DROP POLICY IF EXISTS "Users can update sections in their projects" ON sections;
DROP POLICY IF EXISTS "Users can delete sections in their projects" ON sections;
DROP POLICY IF EXISTS "Users can view comments in their organizations" ON comments;
DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
DROP POLICY IF EXISTS "Users can view their own sync state" ON todoist_sync_state;
DROP POLICY IF EXISTS "Users can manage their own sync state" ON todoist_sync_state;
DROP POLICY IF EXISTS "Users can view their own sync history" ON todoist_sync_history;
DROP POLICY IF EXISTS "Users can create their own sync history" ON todoist_sync_history;
DROP POLICY IF EXISTS "Users can view their own sync conflicts" ON todoist_sync_conflicts;
DROP POLICY IF EXISTS "Users can manage their own sync conflicts" ON todoist_sync_conflicts;

-- Create RLS policies for sections
CREATE POLICY "Users can view sections in their projects" ON sections
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_organizations uo ON p.organization_id = uo.organization_id
            WHERE uo.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create sections in their projects" ON sections
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_organizations uo ON p.organization_id = uo.organization_id
            WHERE uo.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update sections in their projects" ON sections
    FOR UPDATE USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_organizations uo ON p.organization_id = uo.organization_id
            WHERE uo.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete sections in their projects" ON sections
    FOR DELETE USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_organizations uo ON p.organization_id = uo.organization_id
            WHERE uo.user_id = auth.uid()
        )
    );

-- Create RLS policies for comments
CREATE POLICY "Users can view comments in their organizations" ON comments
    FOR SELECT USING (
        (task_id IN (
            SELECT t.id FROM tasks t
            JOIN projects p ON t.project_id = p.id
            JOIN user_organizations uo ON p.organization_id = uo.organization_id
            WHERE uo.user_id = auth.uid()
        )) OR 
        (project_id IN (
            SELECT p.id FROM projects p
            JOIN user_organizations uo ON p.organization_id = uo.organization_id
            WHERE uo.user_id = auth.uid()
        ))
    );

CREATE POLICY "Users can create comments" ON comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" ON comments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON comments
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for todoist sync tables
CREATE POLICY "Users can view their own sync state" ON todoist_sync_state
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own sync state" ON todoist_sync_state
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own sync history" ON todoist_sync_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sync history" ON todoist_sync_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own sync conflicts" ON todoist_sync_conflicts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own sync conflicts" ON todoist_sync_conflicts
    FOR ALL USING (auth.uid() = user_id);

-- Update your Todoist API token (replace with your actual token from .env)
UPDATE profiles 
SET todoist_api_token = '***REMOVED***',
    todoist_sync_enabled = true,
    todoist_auto_sync = true
WHERE email = 'spencerdhill@protonmail.com';

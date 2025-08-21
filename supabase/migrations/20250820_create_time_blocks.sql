-- Create time_blocks table
CREATE TABLE IF NOT EXISTS time_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create time_block_tasks junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS time_block_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  time_block_id UUID NOT NULL REFERENCES time_blocks(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(time_block_id, task_id)
);

-- Add indexes for performance
CREATE INDEX idx_time_blocks_user_id ON time_blocks(user_id);
CREATE INDEX idx_time_blocks_organization_id ON time_blocks(organization_id);
CREATE INDEX idx_time_blocks_start_time ON time_blocks(start_time);
CREATE INDEX idx_time_block_tasks_time_block_id ON time_block_tasks(time_block_id);
CREATE INDEX idx_time_block_tasks_task_id ON time_block_tasks(task_id);

-- Enable Row Level Security
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_block_tasks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for time_blocks
CREATE POLICY "Users can view their own time blocks" ON time_blocks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own time blocks" ON time_blocks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own time blocks" ON time_blocks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time blocks" ON time_blocks
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for time_block_tasks
CREATE POLICY "Users can view their time block tasks" ON time_block_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM time_blocks 
      WHERE time_blocks.id = time_block_tasks.time_block_id 
      AND time_blocks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their time block tasks" ON time_block_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM time_blocks 
      WHERE time_blocks.id = time_block_tasks.time_block_id 
      AND time_blocks.user_id = auth.uid()
    )
  );
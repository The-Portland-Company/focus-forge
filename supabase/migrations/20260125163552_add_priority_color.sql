-- Add priority_color column to users table
-- This allows users to customize the color used for task priorities
-- Default is green (#22c55e) but users can choose any color

ALTER TABLE users ADD COLUMN IF NOT EXISTS priority_color TEXT DEFAULT '#22c55e';

COMMENT ON COLUMN users.priority_color IS 'Custom color for task priorities. Shades are automatically generated from this base color. Default is green.';

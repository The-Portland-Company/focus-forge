-- Add priority_color to profiles with default red for new users

ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS priority_color TEXT DEFAULT '#ef4444';

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS priority_color TEXT DEFAULT '#ef4444';

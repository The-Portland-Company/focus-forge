-- Set default priority color to red for new users

ALTER TABLE IF EXISTS profiles
  ALTER COLUMN priority_color SET DEFAULT '#ef4444';

ALTER TABLE IF EXISTS users
  ALTER COLUMN priority_color SET DEFAULT '#ef4444';

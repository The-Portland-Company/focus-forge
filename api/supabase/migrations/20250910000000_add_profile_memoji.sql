-- Add profile memoji selection to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_memoji TEXT;

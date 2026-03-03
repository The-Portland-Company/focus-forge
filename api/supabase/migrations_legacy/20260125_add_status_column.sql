-- Add status column to profiles table for tracking pending invitations
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending'));

-- Add display_name column if missing
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

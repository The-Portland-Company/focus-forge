-- Add invite-related columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS invite_token TEXT,
ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- Create index for invite token lookups
CREATE INDEX IF NOT EXISTS idx_profiles_invite_token ON profiles(invite_token) WHERE invite_token IS NOT NULL;

-- Add theme preset column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_preset TEXT DEFAULT 'liquid-glass';

-- Add a check constraint to ensure valid theme preset values
ALTER TABLE profiles ADD CONSTRAINT valid_theme_preset 
CHECK (theme_preset IN ('dark', 'light', 'liquid-glass'));

-- Update existing profiles to have the default theme
UPDATE profiles SET theme_preset = 'liquid-glass' WHERE theme_preset IS NULL;
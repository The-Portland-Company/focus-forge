-- Add theme_preset column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS theme_preset TEXT DEFAULT 'modern-dark';
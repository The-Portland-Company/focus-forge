-- Add priority_color column to users table
-- This allows users to customize the color used for task priorities
-- Default is green (#22c55e) but users can choose any color

DO $do$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS priority_color TEXT DEFAULT '#22c55e';
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    COMMENT ON COLUMN public.users.priority_color
      IS 'Custom color for task priorities. Shades are automatically generated from this base color. Default is green.';
  END IF;
END
$do$;

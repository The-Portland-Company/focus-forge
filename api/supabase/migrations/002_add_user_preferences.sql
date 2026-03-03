-- Add is_owner column to user_organizations (guarded for shadow db init)
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_organizations'
  ) THEN
    ALTER TABLE public.user_organizations
      ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT false;
  END IF;
END
$do$;

-- Create user_preferences table for UI state (guarded for shadow db init)
DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS public.user_preferences (
      user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
      expanded_organizations JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.user_preferences (
      user_id UUID PRIMARY KEY,
      expanded_organizations JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END
$do$;

-- Add updated_at trigger (only if function exists)
DO $do$
BEGIN
  IF to_regproc('public.update_updated_at_column') IS NOT NULL THEN
    CREATE TRIGGER update_user_preferences_updated_at
      BEFORE UPDATE ON public.user_preferences
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$do$;

-- Enable RLS for user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preferences
CREATE POLICY "Users can view their own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

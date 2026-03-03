-- Set default priority color to red for new users

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'priority_color'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN priority_color SET DEFAULT '#ef4444';
  END IF;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'priority_color'
  ) THEN
    ALTER TABLE public.users
      ALTER COLUMN priority_color SET DEFAULT '#ef4444';
  END IF;
END
$do$;

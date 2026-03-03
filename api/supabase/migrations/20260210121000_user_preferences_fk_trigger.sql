-- Ensure user_preferences FK and trigger exist after base schema
DO $do$
BEGIN
  IF to_regclass('public.user_preferences') IS NOT NULL THEN
    IF to_regclass('public.profiles') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.user_preferences'::regclass
          AND conname = 'user_preferences_user_id_fkey'
      ) THEN
        ALTER TABLE public.user_preferences
          ADD CONSTRAINT user_preferences_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
      END IF;
    END IF;

    IF to_regproc('public.update_updated_at_column') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_user_preferences_updated_at'
          AND tgrelid = 'public.user_preferences'::regclass
      ) THEN
        CREATE TRIGGER update_user_preferences_updated_at
          BEFORE UPDATE ON public.user_preferences
          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
      END IF;
    END IF;
  END IF;
END
$do$;

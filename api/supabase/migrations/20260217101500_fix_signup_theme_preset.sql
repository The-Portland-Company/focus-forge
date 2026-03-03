-- Fix signup failures caused by an invalid profiles.theme_preset default.
-- The valid_theme_preset constraint only allows: dark, light, liquid-glass.
-- Older schema left default as modern-dark, which breaks inserts from auth trigger.

-- Normalize existing rows before tightening new inserts.
UPDATE public.profiles
SET theme_preset = 'liquid-glass'
WHERE theme_preset IS NULL
   OR theme_preset NOT IN ('dark', 'light', 'liquid-glass');

-- Ensure future profile inserts use an allowed default.
ALTER TABLE public.profiles
ALTER COLUMN theme_preset SET DEFAULT 'liquid-glass';

-- Keep auth signup robust even if metadata contains an unsupported theme.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    display_name,
    theme_preset
  )
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'display_name',
    CASE
      WHEN (new.raw_user_meta_data ->> 'theme_preset') IN ('dark', 'light', 'liquid-glass')
        THEN new.raw_user_meta_data ->> 'theme_preset'
      ELSE 'liquid-glass'
    END
  );

  RETURN new;
END;
$function$;

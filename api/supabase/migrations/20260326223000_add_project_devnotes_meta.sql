ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS devnotes_meta text;

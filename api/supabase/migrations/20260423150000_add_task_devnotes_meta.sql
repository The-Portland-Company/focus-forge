ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS devnotes_meta text;

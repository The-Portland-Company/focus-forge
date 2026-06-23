-- Add creator attribution to tasks.
-- Records which profile created each task so the API, web app, and Forge skill
-- can filter/display tasks by their creator. Existing rows stay NULL (the
-- creator was never recorded historically and cannot be recovered).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_created_by_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);

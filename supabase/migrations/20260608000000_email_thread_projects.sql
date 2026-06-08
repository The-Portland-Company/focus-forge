-- True multi-project association for email threads.
--
-- Previously a thread could belong to at most one project via
-- email_threads.project_id. This join table lets a single thread be associated
-- with many projects. email_threads.project_id is KEPT as the "primary"
-- project for back-compat (single-value queries, default task target); the
-- join table is the source of truth for the full set.
CREATE TABLE IF NOT EXISTS public.email_thread_projects (
  thread_id uuid NOT NULL
    REFERENCES public.email_threads (id) ON DELETE CASCADE,
  project_id uuid NOT NULL
    REFERENCES public.projects (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, project_id)
);

-- Lookups by thread (the common path: "what projects is this thread in?")
-- are served by the PK's leading column, but an explicit project_id index
-- powers the reverse lookup ("which threads belong to this project?").
CREATE INDEX IF NOT EXISTS email_thread_projects_project_id_idx
  ON public.email_thread_projects (project_id);

CREATE INDEX IF NOT EXISTS email_thread_projects_thread_id_idx
  ON public.email_thread_projects (thread_id);

-- Backfill: every thread that already has a primary project_id gets a row.
INSERT INTO public.email_thread_projects (thread_id, project_id)
SELECT id, project_id
FROM public.email_threads
WHERE project_id IS NOT NULL
ON CONFLICT (thread_id, project_id) DO NOTHING;

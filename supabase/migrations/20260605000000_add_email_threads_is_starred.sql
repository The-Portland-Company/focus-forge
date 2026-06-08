-- App-level "starred" flag on email_threads. Gmail-synced stars are not
-- propagated through the sync pipeline, so this is a Focus Forge-local boolean
-- the user toggles from the inbox. Defaults to false; the Starred sidebar view
-- lists threads where is_starred = true.
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS email_threads_is_starred_idx
  ON public.email_threads (is_starred)
  WHERE is_starred = true;

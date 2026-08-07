-- Inbox search performance: resolveSearchThreadIds() in lib/email-inbox/server.ts
-- resolves every search term with `ILIKE '%term%'` across five email_threads
-- columns and two email_participants columns. A leading-wildcard ILIKE cannot
-- use a btree index, so each term forced a FULL SEQUENTIAL SCAN of both tables —
-- twice per term, on a 250ms-debounced keystroke.
--
-- On 2026-08-07, with the project still on Nano compute, that load contributed
-- to the database becoming unable to serve reads at all: requests queued, every
-- API route that touched Supabase hung, and Cloudflare returned 524 once its
-- ~100s origin timeout fired. These GIN trigram indexes turn those scans into
-- index lookups.
--
-- Note: trigram indexes need a search term of at least 3 characters to be used;
-- shorter terms still fall back to a scan, which is why the app also bounds
-- every Supabase request (SUPABASE_REQUEST_TIMEOUT_MS in lib/supabase/admin.ts).
--
-- Additive and idempotent: creates an extension and indexes only, no data or
-- schema is rewritten, safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- email_threads: the five columns in SEARCH_THREAD_COLUMNS.
CREATE INDEX IF NOT EXISTS idx_email_threads_subject_trgm
  ON public.email_threads USING gin (subject gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_email_threads_normalized_subject_trgm
  ON public.email_threads USING gin (normalized_subject gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_email_threads_preview_text_trgm
  ON public.email_threads USING gin (preview_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_email_threads_summary_text_trgm
  ON public.email_threads USING gin (summary_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_email_threads_action_title_trgm
  ON public.email_threads USING gin (action_title gin_trgm_ops);

-- email_participants: the participant half of the search union. This table has
-- several rows per thread, so it is the larger of the two scans.
CREATE INDEX IF NOT EXISTS idx_email_participants_display_name_trgm
  ON public.email_participants USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_email_participants_email_address_trgm
  ON public.email_participants USING gin (email_address gin_trgm_ops);

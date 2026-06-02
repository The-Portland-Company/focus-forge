-- email_threads is missing the `origin` column that the inbox server code reads
-- and writes ('inbound' | 'outbound' | 'mixed'). Add it, backfill from existing
-- direction-bearing timestamps, and default new rows to 'inbound'.
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS origin text;

UPDATE public.email_threads
   SET origin = CASE
     WHEN latest_inbound_at IS NOT NULL AND latest_outbound_at IS NOT NULL THEN 'mixed'
     WHEN latest_outbound_at IS NOT NULL THEN 'outbound'
     ELSE 'inbound'
   END
 WHERE origin IS NULL;

ALTER TABLE public.email_threads
  ALTER COLUMN origin SET DEFAULT 'inbound';

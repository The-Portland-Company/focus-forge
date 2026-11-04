-- Covering partial index for the email-inbox sync-dedup lookup.
-- Query (lib/email-inbox/server.ts, ~1M calls): WHERE mailbox_id = ? AND direction = 'inbound'
-- AND thread_id = ANY(...) AND provider_message_id IS NOT NULL, selecting (thread_id, provider_message_id).
-- Without this index the lookup near-seqscanned email_messages and was a major Supabase egress driver.
-- Applied live in prod 2026-11-03; this migration adds it for parity.
CREATE INDEX IF NOT EXISTS idx_email_messages_mailbox_dir_thread
  ON public.email_messages (mailbox_id, direction, thread_id)
  INCLUDE (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

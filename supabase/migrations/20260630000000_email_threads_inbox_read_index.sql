-- Inbox read-path performance: the inbox list query in
-- listInboxItemsForUser() filters email_threads by mailbox_id and orders by
-- latest_message_at DESC (capped at 200 rows). Without a matching composite
-- index Postgres has to scan + sort, which dominates inbox load time as thread
-- volume grows. These indexes back that exact access pattern.
--
-- Idempotent: safe to re-run; only creates if missing.

-- Primary inbox list index: filter on mailbox_id, ordered by latest_message_at.
CREATE INDEX IF NOT EXISTS idx_email_threads_mailbox_latest
  ON public.email_threads (mailbox_id, latest_message_at DESC);

-- Partial index for the unread badge count / unread-only reads. is_unread is a
-- real boolean column on email_threads (filtered via .eq("is_unread", true) in
-- getUnreadBadgeCountForUser and updated throughout lib/email-inbox/server.ts).
CREATE INDEX IF NOT EXISTS idx_email_threads_mailbox_latest_unread
  ON public.email_threads (mailbox_id, latest_message_at DESC)
  WHERE is_unread = true;

-- Remember which category label Focus already pushed to the mail provider for a
-- thread. Inbox tabs are a Focus-side concept; mirroring them into Gmail (as a
-- label + removal from the Inbox) is an IMAP folder move, and without a record
-- of the last pushed label every sync would re-open an IMAP connection and try
-- to move messages that are already filed.
--
-- Additive: existing threads keep NULL, which simply means "never mirrored".
alter table public.email_threads
  add column if not exists provider_label_name text;

alter table public.email_threads
  add column if not exists provider_label_synced_at timestamptz;

-- Which IMAP folder a message currently lives in. NULL means "the mailbox's
-- synced folder" (INBOX) — the assumption the app made everywhere before
-- category labels existed, so existing rows stay correct.
--
-- This has to be recorded because an IMAP UID is scoped to one folder: once a
-- message is moved into its label folder it gets a NEW uid there and the old
-- INBOX uid is dead. Without the folder (and the refreshed uid) alongside it,
-- every later UID-addressed operation — fetching an attachment, marking read,
-- archiving, deleting — would silently target nothing.
alter table public.email_messages
  add column if not exists provider_folder_path text;

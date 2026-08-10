-- Let a Focus outbound draft point back at a draft that lives in the mail
-- provider (e.g. Gmail's [Gmail]/Drafts). Drafts composed directly in Gmail
-- were never synced into Focus, so they never appeared on the Drafts page; these
-- columns let the sync ingest and reconcile them.
--
-- Additive: existing app-composed drafts keep NULLs and behave exactly as
-- before. A NULL provider_message_id marks a draft that only exists in Focus.
alter table public.email_outbound_drafts
  add column if not exists provider_message_id text;

alter table public.email_outbound_drafts
  add column if not exists internet_message_id text;

-- The IMAP folder the provider draft lives in, kept so the sync can reconcile
-- against it and a future send can remove the provider-side copy.
alter table public.email_outbound_drafts
  add column if not exists provider_folder_path text;

-- One Focus row per provider draft, so re-syncing updates rather than dupes.
create unique index if not exists email_outbound_drafts_provider_uid_idx
  on public.email_outbound_drafts (mailbox_id, provider_message_id)
  where provider_message_id is not null;

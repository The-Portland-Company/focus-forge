-- Contacts: record the business a person belongs to.
--
-- The email thread header resolves To/Cc/Bcc addresses against Contacts and
-- shows the person's name plus their company. Additive and nullable: existing
-- rows keep working and stay company-less until a re-import backfills them.
alter table public.contacts
  add column if not exists company text;

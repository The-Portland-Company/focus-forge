-- Per-organization media storage account. Proof capture (DevNotes screenshots /
-- screen recordings, and any Forge attachment that opts in) uploads through the
-- Snap Shoot Share storage Worker using THIS org's own account token, so each
-- organization stores media in — and is billed for — its own account:
--
--   {
--     "provider": "snap-shoot-share",
--     "endpoint": "https://snap-shoot-share-api.the-portland-company.workers.dev",
--     "label": "Spencer's SSS account",
--     "tokenCipher": "<AES-256-GCM ciphertext of { token: 'tpc_live_...' }>",
--     "updatedAt": "2026-09-03T00:00:00.000Z"
--   }
--
-- The token is only ever held as ciphertext (lib/email-inbox/crypto.ts,
-- AES-256-GCM keyed off EMAIL_INBOX_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY);
-- the GET route returns a status view without it. Additive: existing orgs get
-- '{}' and simply have no configured storage account (proof capture then falls
-- back to Forge's default task-attachments bucket). The column inherits the
-- existing RLS on public.organizations; writes go through
-- /api/organizations/[id]/media-storage, which requires org admin/owner.
alter table public.organizations
  add column if not exists media_storage jsonb not null default '{}'::jsonb;

comment on column public.organizations.media_storage is
  'Per-org media storage account for proof capture. { provider, endpoint, label, tokenCipher (encrypted Snap Shoot Share tpc_live_ token), updatedAt }.';

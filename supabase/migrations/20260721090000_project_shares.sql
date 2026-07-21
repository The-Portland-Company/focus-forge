-- Backfill migration for public.project_shares.
--
-- This table backs public project share links (/share/<token>) and was created
-- out-of-band in the Supabase dashboard, so the repo could not rebuild it from
-- scratch. Transcribed from the live production definition.
--
-- Idempotent by construction: on an existing database every statement is a
-- no-op. Dated ahead of 20260721100000_project_shares_permission.sql so a
-- from-scratch rebuild creates the table before that migration adds
-- `permission`.

create table if not exists public.project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Unguessable url-safe random string, generated in app code (no default).
  token text not null unique,
  -- scrypt as `salt:hash` (both hex). Null when the link has no passcode.
  passcode_hash text,
  expires_at timestamptz,
  -- Visibility kill-switch, distinct from the access level in `permission`.
  allow_public boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  -- Soft revoke; links are never hard-deleted.
  revoked_at timestamptz
);

create index if not exists project_shares_project_id_idx
  on public.project_shares using btree (project_id);
create index if not exists project_shares_token_idx
  on public.project_shares using btree (token);

alter table public.project_shares enable row level security;

-- Only members of the project (directly, or via its organization) may manage
-- share links. Public *readers* never hit this table through PostgREST — the
-- share page resolves tokens with the service-role client, which bypasses RLS.
drop policy if exists project_shares_member_all on public.project_shares;
create policy project_shares_member_all
  on public.project_shares
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_projects up
      where up.project_id = project_shares.project_id
        and up.user_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      join public.user_organizations uo
        on uo.organization_id = p.organization_id
      where p.id = project_shares.project_id
        and uo.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_projects up
      where up.project_id = project_shares.project_id
        and up.user_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      join public.user_organizations uo
        on uo.organization_id = p.organization_id
      where p.id = project_shares.project_id
        and uo.user_id = auth.uid()
    )
  );

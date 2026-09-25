-- TPC Auth integration: additive step (NOT applied by this change).
--
-- Adds tpc_sub / tpc_org_id columns alongside the existing local user_id /
-- organization_id columns on every table that currently identifies a person
-- or an org. Nothing is dropped here — see
-- 20260924000001_tpc_auth_deferred_drop.sql for the drop step, which must not
-- run until the identity-link backfill (email -> tpc_sub, local org ->
-- tpc_org_id) has been applied and asserted to have zero unmatched non-null
-- rows, per handoff-prompt.md step 4.
--
-- Table list below was derived from `.from("...")` call sites in lib/ and
-- app/ (grep, 2026-09-24), not from a full schema dump — confirm against the
-- live Supabase schema before applying, since a couple of these tables may
-- reference organization_id indirectly (via a parent row) rather than
-- directly, in which case the ALTER on that table is a no-op to remove.

begin;

-- People/org identity tables themselves get no tpc_sub/tpc_org_id: they are
-- being replaced outright by TPC Auth (see deferred-drop migration).

-- Asset tables carrying a direct organization_id today.
alter table if exists public.projects            add column if not exists tpc_org_id uuid;
alter table if exists public.goals               add column if not exists tpc_org_id uuid;
alter table if exists public.plans               add column if not exists tpc_org_id uuid;
alter table if exists public.groups              add column if not exists tpc_org_id uuid;
alter table if exists public.mailboxes           add column if not exists tpc_org_id uuid;
alter table if exists public.email_mailboxes     add column if not exists tpc_org_id uuid;
alter table if exists public.contacts            add column if not exists tpc_org_id uuid;
alter table if exists public.sentry_connections  add column if not exists tpc_org_id uuid;
alter table if exists public.audit_logs          add column if not exists tpc_org_id uuid;
alter table if exists public.audit_logs          add column if not exists tpc_sub uuid;
alter table if exists public.spam_policies       add column if not exists tpc_org_id uuid;
alter table if exists public.on_hand_supplies    add column if not exists tpc_org_id uuid;

-- Asset tables carrying a direct user_id today.
alter table if exists public.profiles            add column if not exists tpc_sub uuid;
alter table if exists public.ai_memories         add column if not exists tpc_sub uuid;
alter table if exists public.ai_planner_sessions add column if not exists tpc_sub uuid;
alter table if exists public.reminders           add column if not exists tpc_sub uuid;
alter table if exists public.tags                add column if not exists tpc_sub uuid;
alter table if exists public.mobile_push_devices add column if not exists tpc_sub uuid;
alter table if exists public.project_shares      add column if not exists tpc_sub uuid;

create index if not exists idx_projects_tpc_org_id           on public.projects (tpc_org_id);
create index if not exists idx_goals_tpc_org_id              on public.goals (tpc_org_id);
create index if not exists idx_plans_tpc_org_id              on public.plans (tpc_org_id);
create index if not exists idx_groups_tpc_org_id             on public.groups (tpc_org_id);
create index if not exists idx_mailboxes_tpc_org_id          on public.mailboxes (tpc_org_id);
create index if not exists idx_email_mailboxes_tpc_org_id    on public.email_mailboxes (tpc_org_id);
create index if not exists idx_contacts_tpc_org_id           on public.contacts (tpc_org_id);
create index if not exists idx_audit_logs_tpc_org_id         on public.audit_logs (tpc_org_id);
create index if not exists idx_audit_logs_tpc_sub            on public.audit_logs (tpc_sub);
create index if not exists idx_profiles_tpc_sub              on public.profiles (tpc_sub);
create index if not exists idx_ai_memories_tpc_sub           on public.ai_memories (tpc_sub);
create index if not exists idx_ai_planner_sessions_tpc_sub   on public.ai_planner_sessions (tpc_sub);
create index if not exists idx_reminders_tpc_sub             on public.reminders (tpc_sub);
create index if not exists idx_project_shares_tpc_sub        on public.project_shares (tpc_sub);

commit;

-- Backfill (NOT included/applied here): apply the email -> tpc_sub and
-- local-org -> tpc_org_id mapping received from the TPC Auth operator (per
-- scripts/link-identities.mjs in the tpc-auth repo) in its own transactional
-- migration, then assert zero-null tpc_sub/tpc_org_id for rows whose old FK
-- was non-null before proceeding to the deferred-drop migration.

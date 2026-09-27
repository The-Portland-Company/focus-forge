-- TPC Auth integration: DEFERRED DROP step. DO NOT APPLY YET.
--
-- This file is intentionally not run by this change. It is the step-7
-- deletion of local identity storage from handoff-prompt.md, and it must
-- only be applied after:
--   1. 20260924000000_tpc_auth_additive.sql has been applied to production.
--   2. The identity-link backfill (local user -> tpc_sub, local org ->
--      tpc_org_id) has been applied and asserted: zero NULL tpc_sub for rows
--      whose old user_id/organization_id FK was non-null.
--   3. Every read path in the app has been switched to read tpc_sub /
--      tpc_org_id instead of the local FK (see final report: this switch is
--      NOT yet done across lib/app — only /api/mcp's auth gate has been
--      migrated so far).
--   4. A full backup/snapshot of the tables below has been taken.
--
-- Running this against a database where (3) is incomplete will silently
-- orphan every asset row for any user whose app code still reads the old
-- column.

begin;

-- Local API keys / PATs / org API keys: superseded by TPC personal access
-- tokens (tpc_pat_...). Give existing key holders whatever deprecation
-- window is agreed (see final report for the recommended sunset date) before
-- applying this.
drop table if exists public.organization_api_keys;
drop table if exists public.personal_access_tokens;
drop table if exists public.api_tokens;
drop table if exists public.api_token_groups;
drop table if exists public.api_token_users;

-- Local org model: replaced by TPC Auth's org/role claims (ctx.orgs).
drop table if exists public.user_organizations;
drop table if exists public.organizations;

-- Old direct FK columns, once every asset table above reads tpc_org_id /
-- tpc_sub instead.
alter table if exists public.projects            drop column if exists organization_id;
alter table if exists public.goals               drop column if exists organization_id;
alter table if exists public.plans               drop column if exists organization_id;
alter table if exists public.groups              drop column if exists organization_id;
alter table if exists public.mailboxes           drop column if exists organization_id;
alter table if exists public.email_mailboxes     drop column if exists organization_id;
alter table if exists public.contacts            drop column if exists organization_id;
alter table if exists public.sentry_connections  drop column if exists organization_id;
alter table if exists public.audit_logs          drop column if exists organization_id;
alter table if exists public.audit_logs          drop column if exists user_id;
alter table if exists public.spam_policies       drop column if exists organization_id;
alter table if exists public.on_hand_supplies    drop column if exists organization_id;
alter table if exists public.profiles            drop column if exists user_id;
alter table if exists public.ai_memories         drop column if exists user_id;
alter table if exists public.ai_planner_sessions drop column if exists user_id;
alter table if exists public.reminders           drop column if exists user_id;
alter table if exists public.project_shares      drop column if exists user_id;

commit;

-- Rules engine Phases 1-3 — deterministic triage before the inbox.
--
-- Additive only. Adds:
--   * email_threads.triage_json  — the per-thread deterministic record (small,
--     overwritten on reprocess, zero growth): which rule/AI decided, matched
--     rule ids, actions, terminal flag, and the AI sub-result when it ran.
--   * email_threads.triage_state — 'rule' | 'pending_ai' | 'ai' | 'manual',
--     indexed with mailbox_id so the sync batch can find threads still awaiting
--     AI enhancement.
--   * email_rules.fingerprint   — sha256 of scope + sorted normalised
--     conditions + sorted actions, used by the proposeRule dedup gate. A PARTIAL
--     unique index on (user_id, fingerprint) WHERE is_active enforces no two
--     active user-scoped rules share a fingerprint.
--   * email_rules.group_key     — 'receipts' | 'otp' | 'newsletters' |
--     'known_contacts' | 'vendors' | ... for sensible grouping / merge.
--   * email_rules.generated_by  — 'user' | 'ai' | 'system'.
--   * email_rules.hit_count / last_hit_at — replaces per-hit email_rule_runs
--     history for the common "how often did this fire" question.
--
-- Everything is guarded with to_regclass + IF NOT EXISTS so a fresh CI replay
-- (which does not contain the api-level email schema chain) is a clean no-op
-- rather than an error, matching 20261026000000_ai_decision_traces_retention.sql.

do $$
begin
  if to_regclass('public.email_threads') is not null then
    alter table public.email_threads
      add column if not exists triage_json jsonb;
    alter table public.email_threads
      add column if not exists triage_state text;

    -- Validate the small enum defensively without an ALTER TYPE (non-destructive).
    if not exists (
      select 1 from pg_constraint where conname = 'email_threads_triage_state_check'
    ) then
      alter table public.email_threads
        add constraint email_threads_triage_state_check
        check (
          triage_state is null
          or triage_state in ('rule', 'pending_ai', 'ai', 'manual')
        );
    end if;

    create index if not exists idx_email_threads_mailbox_triage_state
      on public.email_threads (mailbox_id, triage_state);
  end if;
end
$$;

do $$
begin
  if to_regclass('public.email_rules') is not null then
    alter table public.email_rules
      add column if not exists fingerprint text;
    alter table public.email_rules
      add column if not exists group_key text;
    alter table public.email_rules
      add column if not exists generated_by text;
    alter table public.email_rules
      add column if not exists hit_count integer not null default 0;
    alter table public.email_rules
      add column if not exists last_hit_at timestamptz;

    if not exists (
      select 1 from pg_constraint where conname = 'email_rules_generated_by_check'
    ) then
      alter table public.email_rules
        add constraint email_rules_generated_by_check
        check (
          generated_by is null
          or generated_by in ('user', 'ai', 'system')
        );
    end if;

    -- A user cannot hold two ACTIVE rules with the same fingerprint. Partial so
    -- inactive/superseded rules may keep an old fingerprint without conflict.
    create unique index if not exists email_rules_user_fingerprint_active_uidx
      on public.email_rules (user_id, fingerprint)
      where is_active and fingerprint is not null;

    create index if not exists idx_email_rules_group_key
      on public.email_rules (user_id, group_key);
  end if;
end
$$;

-- Spam explainability: a per-thread AI assessment, plus the standing policy
-- statements a user arrives at by arguing with that assessment.

-- The cached "why is this spam" assessment for one thread. Nullable because the
-- assessment is deliberately NOT produced on every sync — it costs a model call,
-- so it is generated on demand (the Analyze button) and reused afterwards.
alter table public.email_threads
  add column if not exists spam_assessment_json jsonb;

-- Plain-language spam policies the user settled on, e.g.
--   "When emails read like an unsolicited pitch from an unknown domain that
--    offers leads or SEO work, they will be marked as spam."
-- These are the durable output of the training conversation: readable by the
-- user, and fed to the classifier as prompt context on later assessments.
create table if not exists public.spam_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  mailbox_id uuid references public.mailboxes (id) on delete cascade,
  -- The finalized sentence shown back to the user.
  statement text not null,
  -- The {assessment} clause on its own, so it can be recombined or edited.
  assessment text not null,
  -- Which way the policy points: mail matching it is spam, or explicitly is not.
  label text not null default 'spam' check (label in ('spam', 'not_spam')),
  -- The email the conversation started from, kept for provenance.
  source_thread_id uuid references public.email_threads (id) on delete set null,
  -- The conversation that produced the statement, for review and re-editing.
  transcript_json jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spam_policies_user_status_idx
  on public.spam_policies (user_id, status);

alter table public.spam_policies enable row level security;

-- A policy is personal: only its owner reads or writes it. auth.uid() is wrapped
-- in a select so Postgres evaluates it once per statement rather than per row.
drop policy if exists spam_policies_select_own on public.spam_policies;
create policy spam_policies_select_own on public.spam_policies
  for select using (user_id = (select auth.uid()));

drop policy if exists spam_policies_insert_own on public.spam_policies;
create policy spam_policies_insert_own on public.spam_policies
  for insert with check (user_id = (select auth.uid()));

drop policy if exists spam_policies_update_own on public.spam_policies;
create policy spam_policies_update_own on public.spam_policies
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists spam_policies_delete_own on public.spam_policies;
create policy spam_policies_delete_own on public.spam_policies
  for delete using (user_id = (select auth.uid()));

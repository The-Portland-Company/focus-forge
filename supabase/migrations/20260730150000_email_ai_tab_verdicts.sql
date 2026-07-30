-- Cached "AI decides" verdicts for inbox tab rules.
--
-- An inbox tab condition of field `ai_intent` asks a model a yes/no question
-- about the email ("is this about a client invoice?"). The answer is decided
-- once per (thread, question) and cached here, keyed by the normalized
-- question text, so filtering the inbox never calls a model.
alter table public.email_threads
  add column if not exists ai_tab_verdicts_json jsonb not null default '{}'::jsonb;

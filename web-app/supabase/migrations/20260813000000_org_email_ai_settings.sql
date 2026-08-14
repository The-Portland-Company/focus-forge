-- Per-organization AI configuration. Today this holds the email/spam triage
-- provider waterfall so each org can pick its own order of DeepSeek / Claude /
-- Grok (and turn LLM triage off entirely in favour of local heuristics):
--
--   { "email": { "enabled": true, "chain": ["deepseek-chat", "claude-opus-4-8", "grok-3"] } }
--
-- Additive: existing orgs get '{}' and behave exactly as before, resolving to
-- the DeepSeek-first default chain in lib/ai/email-provider.ts. The column
-- inherits the existing RLS on public.organizations; writes go through
-- /api/organizations/[id]/ai-settings, which requires org admin/owner.
alter table public.organizations
  add column if not exists ai_settings jsonb not null default '{}'::jsonb;

comment on column public.organizations.ai_settings is
  'Per-org AI configuration. { "email": { "enabled": boolean, "chain": string[] } } — the ordered provider waterfall for inbound email/spam triage.';

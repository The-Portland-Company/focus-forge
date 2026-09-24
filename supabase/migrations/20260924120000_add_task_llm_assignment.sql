-- Task-level LLM assignment: which provider / model / effort level an AI agent
-- should use when it picks this task up. All nullable; null = "unassigned,
-- use the caller's default". Free-form text (validated at the app layer) so
-- new providers/models don't need a migration. RLS on public.tasks is
-- column-agnostic, so no policy changes are needed. Idempotent.
alter table public.tasks
  add column if not exists llm_provider text,
  add column if not exists llm_model text,
  add column if not exists llm_effort text;

alter table public.tasks
  drop constraint if exists tasks_llm_effort_check;
alter table public.tasks
  add constraint tasks_llm_effort_check
  check (llm_effort is null or llm_effort in ('low', 'medium', 'high', 'max'));

comment on column public.tasks.llm_provider is 'LLM provider an agent should use for this task (e.g. anthropic, openai, google, xai). Null = unassigned.';
comment on column public.tasks.llm_model is 'Model id/name an agent should use for this task (e.g. claude-sonnet-5). Null = unassigned.';
comment on column public.tasks.llm_effort is 'Reasoning effort an agent should use: low | medium | high | max. Null = unassigned.';

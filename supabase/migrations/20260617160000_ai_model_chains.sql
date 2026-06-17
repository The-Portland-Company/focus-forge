-- Independent, per-user AI model waterfall chains.
--   ai_model_chains: JSONB { estimator: string[], assistant: string[] } of known
--     model ids. The estimator and the assistant each configure their OWN
--     ordered, quality-first waterfall (separate default + separate chain);
--     changing one MUST NOT change the other. Position 1 of each chain is that
--     surface's default model; on a balance/quota/credit/auth error the runner
--     falls through to the next model in that surface's chain.
--
-- Default (quality-first) ordering for both surfaces:
--   1. claude-opus-4-8 (Anthropic)
--   2. gpt-4.1 (OpenAI)
--   3. claude-sonnet-4-6 (Anthropic)
--   4. grok-3 (xAI)

alter table public.profiles
add column if not exists ai_model_chains jsonb not null
  default '{"estimator":["claude-opus-4-8","gpt-4.1","claude-sonnet-4-6","grok-3"],"assistant":["claude-opus-4-8","gpt-4.1","claude-sonnet-4-6","grok-3"]}'::jsonb;

update public.profiles
set ai_model_chains = '{"estimator":["claude-opus-4-8","gpt-4.1","claude-sonnet-4-6","grok-3"],"assistant":["claude-opus-4-8","gpt-4.1","claude-sonnet-4-6","grok-3"]}'::jsonb
where ai_model_chains is null;

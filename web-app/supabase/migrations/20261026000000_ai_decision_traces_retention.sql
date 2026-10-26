-- ai_decision_traces retention (30 days) — codifies the job already live in prod.
--
-- Context: ai_decision_traces (created in supabase/migrations/20260607000000_
-- ai_memory.sql — the api-level schema chain) had grown to ~1.6 GB / 622k rows,
-- driven by the email classification path re-tracing already-ingested threads on
-- every poll. The table has been trimmed in production to the last 30 days and a
-- daily pg_cron job `ai_decision_traces_retention` already runs there. This
-- migration makes that reproducible on a fresh environment. It does NOT delete
-- any data at apply time (the one-time cleanup was done out-of-band under owner
-- sign-off); it only (re)creates the supporting index and the recurring job.
--
-- INFRA: pg_cron must be available (it is in Supabase). On a plain throwaway
-- Postgres (the CI migration-replay gate) the pg_cron extension is absent, so
-- this migration is reported as a warning there — identical to the existing
-- 20260918000000_jev_triage_cron.sql. Everything here is idempotent.

create extension if not exists pg_cron with schema pg_cron;

-- Supporting index for the age-based purge. Guarded so a replay in a chain that
-- does not (yet) contain ai_decision_traces is a clean no-op rather than an error.
do $$
begin
  if to_regclass('public.ai_decision_traces') is not null then
    create index if not exists ai_decision_traces_created_at_idx
      on public.ai_decision_traces (created_at);
  end if;
end
$$;

-- Idempotent: drop any prior schedule of the same name before recreating.
select cron.unschedule('ai_decision_traces_retention')
where exists (
  select 1 from cron.job where jobname = 'ai_decision_traces_retention'
);

-- Daily at 09:00 UTC (~1-2am US Pacific, off-peak). Matches the live job: delete
-- every trace older than 30 days. Wrapped in a guard so the job no-ops cleanly if
-- the table is ever absent instead of erroring in the cron log.
select cron.schedule(
  'ai_decision_traces_retention',
  '0 9 * * *',
  $cron$
  do $job$
  begin
    if to_regclass('public.ai_decision_traces') is not null then
      delete from public.ai_decision_traces
       where created_at < now() - interval '30 days';
    end if;
  end
  $job$;
  $cron$
);

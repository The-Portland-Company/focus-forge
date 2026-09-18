-- Nightly server-side Jev (TypeSafe) task triage.
--
-- Schedules a nightly pg_cron job that POSTs to the app's /api/mobile/jev route
-- (app/api/mobile/jev/route.ts). That route scores each open task in a project
-- with TypeSafe's calibrated model and — only for act-band results whose priority
-- changed — writes the new priority + a rationale comment back. confirm/escalate
-- bands are returned for human review, never auto-written. Nothing sensitive
-- leaves the server: the route sends TypeSafe only task title/description/dates/
-- tags/current-priority/status.
--
-- INFRA + SECRET — reviewed by a human, applied deliberately. Two secrets must
-- exist in Supabase Vault BEFORE the job can succeed (the job no-ops loudly until
-- they do):
--
--   jev_triage_url    -> https://focusforge.theportlandcompany.com/api/mobile/jev
--   jev_triage_token  -> a Forge PAT with write+admin scope (Authorization bearer)
--
-- Provision them once (service-role / SQL editor), never in this migration:
--   select vault.create_secret('https://focusforge.theportlandcompany.com/api/mobile/jev', 'jev_triage_url');
--   select vault.create_secret('<forge-pat>', 'jev_triage_token');
--
-- The PAT is the only credential the job holds; TYPESAFE_API_KEY lives in the
-- app's own server env (Railway), never here.

create extension if not exists pg_cron with schema pg_cron;
create extension if not exists pg_net with schema extensions;

-- Idempotent: drop a prior schedule of the same name before recreating.
select cron.unschedule('jev-nightly-triage')
where exists (select 1 from cron.job where jobname = 'jev-nightly-triage');

-- 08:00 UTC daily (~midnight–1am US Pacific). Reads the URL + bearer from Vault
-- at run time; if either secret is absent the job raises a notice and does not
-- fire an unauthenticated request.
select cron.schedule(
  'jev-nightly-triage',
  '0 8 * * *',
  $cron$
  do $job$
  declare
    v_url text;
    v_token text;
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'jev_triage_url';
    select decrypted_secret into v_token
      from vault.decrypted_secrets where name = 'jev_triage_token';

    if v_url is null or v_token is null then
      raise notice 'jev-nightly-triage skipped: jev_triage_url/jev_triage_token not set in Vault';
      return;
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body := jsonb_build_object(
        'projectId', 'f0010ce0-cd95-45e7-9db7-ed9443b6634b'
      )
    );
  end
  $job$;
  $cron$
);

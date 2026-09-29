-- Postgres-backed CounterStore for packages/auth/src/rate-limit.ts (dailyCap,
-- postgresCounterStore). Backs UTC-day agent caps for Railway apps and for
-- tpc-auth's own MCP create_pat tool (10 agent PATs/day).
-- NOT APPLIED by this branch — review and apply separately.

create table if not exists public.agent_quota_counters (
  key text primary key,
  count int not null default 0,
  window_end timestamptz not null
);

comment on table public.agent_quota_counters is 'Fixed-window counters for packages/auth/src/rate-limit.ts dailyCap/postgresCounterStore. One row per (action, actor, window) key; expired rows reset on next increment rather than being pruned eagerly.';

alter table public.agent_quota_counters enable row level security;
-- No policies: only the security-definer RPC below (and direct service_role
-- access) may touch this table. No anon/authenticated access whatsoever.

-- Atomically increments the counter for `key`, resetting it if the window
-- has expired, and returns the count *after* incrementing. `ttl_sec` sets
-- how far out the new window's end is when a reset happens; an in-window
-- increment ignores it.
drop function if exists public.incr_quota_counter(text, int);
create function public.incr_quota_counter(p_key text, p_ttl_sec int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  insert into public.agent_quota_counters as c (key, count, window_end)
  values (p_key, 1, now() + make_interval(secs => p_ttl_sec))
  on conflict on constraint agent_quota_counters_pkey do update
    set count = case
          when c.window_end <= now() then 1
          else c.count + 1
        end,
        window_end = case
          when c.window_end <= now() then now() + make_interval(secs => p_ttl_sec)
          else c.window_end
        end
  returning c.count into new_count;

  return new_count;
end;
$$;

revoke all on function public.incr_quota_counter(text, int) from public, anon, authenticated;
grant execute on function public.incr_quota_counter(text, int) to service_role;
revoke all on table public.agent_quota_counters from anon, authenticated;

-- Backfill: tasks created by Swarm Tester before tasks.source existed
-- (20260925090000_task_source_tpc_identity.sql) still carry a literal
-- "[swarm-tester] " title prefix as their only marker, and now that the
-- TaskSourceIcon renders provenance from tasks.source, the prefix is
-- redundant clutter. Purely additive/idempotent data backfill:
--   1. Set source = 'swarm-tester' on any bracket-prefixed task missing it
--      (covers the handful created before the server-side derivation shipped).
--   2. Strip the "[swarm-tester] " prefix from every matching title, once.
-- Safe to re-run: both statements are no-ops once applied.

begin;

update public.tasks
set source = 'swarm-tester'
where name like '[swarm-tester] %'
  and source is null;

update public.tasks
set name = substring(name from length('[swarm-tester] ') + 1)
where name like '[swarm-tester] %';

commit;

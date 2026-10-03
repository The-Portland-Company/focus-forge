-- P6: Forge backlog reconciliation (Specs <-> Forge sync, docs/sync-contract.md).
--
-- tasks.type only allowed 'task' | 'bug' | 'feature'. Plan rule 6 says Forge
-- can start bug and ops work with no spec, so ops-shaped backlog needs a
-- real type value distinct from 'bug' and 'task' instead of overloading an
-- unrelated column. Adds 'ops' to the existing check constraint.
--
-- Idempotent: safe to re-run (drops + recreates the same-named constraint).

alter table public.tasks
  drop constraint if exists tasks_type_check;

alter table public.tasks
  add constraint tasks_type_check
  check (type = any (array['task'::text, 'bug'::text, 'feature'::text, 'ops'::text]));

comment on column public.tasks.type is
  'task | bug | feature | ops. Feature work should link to a goal with a spec (specs_id); bug/ops may stand alone per sync-contract.md rule 6.';

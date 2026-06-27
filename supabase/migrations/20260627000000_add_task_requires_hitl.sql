-- Add a per-task "Requires Human in the Loop (HITL) to complete" flag.
--
-- When requires_hitl is true, AI agents / automation must NOT auto-complete the
-- task; completion has to come from a human. Enforcement lives in the app layer
-- (the AI agent tool refuses to complete HITL tasks), but the flag is persisted
-- here so every read/write path (web, mobile REST, DevNotes) can surface it.
--
-- RLS on public.tasks is already enabled with org/project-scoped row policies and
-- table-level grants; those are column-agnostic, so the existing policies cover
-- this new column for the same roles that can already read/write tasks. No policy
-- or grant change is needed here.
--
-- Idempotent: safe to re-run.

alter table public.tasks
  add column if not exists requires_hitl boolean not null default false;

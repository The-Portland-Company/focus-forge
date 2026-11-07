-- Lock down multi-org helper/trigger functions flagged by Supabase Advisor
-- (lints 0028/0029: SECURITY DEFINER functions executable by anon/authenticated
-- via PostgREST RPC).
--
-- Safe because none of these are meant to be called over the API:
--   * guard_project_primary_org_change / sync_project_primary_org /
--     reassign_shared_projects_before_org_delete are TRIGGER functions — they
--     fire as the table owner, so a caller never needs EXECUTE.
--   * project_org_ids is not referenced by any RLS policy, function, or app
--     code, so nothing depends on anon/authenticated holding EXECUTE.
-- The four RLS *helper* predicates (is_project_org_admin,
-- is_project_primary_org_admin, user_belongs_to_project_org,
-- user_has_project_org_access) are intentionally left executable by
-- `authenticated` — row-level-security policies call them — and are recorded in
-- supabase/advisor-baseline.json instead.
--
-- Applied live to prod 2026-11-07; this migration adds it for parity. Guarded
-- with to_regprocedure() so a shadow/replay DB that does not yet have these
-- functions treats each statement as a no-op instead of erroring.
do $$
begin
  if to_regprocedure('public.guard_project_primary_org_change()') is not null then
    revoke execute on function public.guard_project_primary_org_change() from anon, authenticated, public;
  end if;
  if to_regprocedure('public.sync_project_primary_org()') is not null then
    revoke execute on function public.sync_project_primary_org() from anon, authenticated, public;
  end if;
  if to_regprocedure('public.reassign_shared_projects_before_org_delete()') is not null then
    revoke execute on function public.reassign_shared_projects_before_org_delete() from anon, authenticated, public;
  end if;
  if to_regprocedure('public.project_org_ids(uuid)') is not null then
    revoke execute on function public.project_org_ids(uuid) from anon, authenticated, public;
  end if;
end $$;

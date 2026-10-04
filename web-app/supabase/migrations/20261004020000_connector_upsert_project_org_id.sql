-- Fix: connector_upsert_project never set projects.organization_id, so every
-- project created through it (the P4.G3 VRM-tree import in
-- scripts/import-specs-tree.mjs, and any inbound Specs->Forge project event
-- via app/api/connectors/specs/events) landed with organization_id = NULL --
-- invisible in any org-scoped sidebar/list. All 42 VRM-tree projects were
-- fixed by hand in prod (organization_id stamped to the Politogy org); this
-- migration fixes the function so a future create/re-run is correct.
--
-- Adds p_organization_id (default null, so existing non-VRM callers that
-- don't pass it keep today's behavior on update: coalesce keeps whatever
-- organization_id a row already has rather than nulling it back out).
--
-- Adding a parameter changes the function's argument signature, so the old
-- 7-arg overload is dropped first -- otherwise both would coexist and any
-- caller still using the old positional/7-key call shape would silently hit
-- the wrong one.
drop function if exists public.connector_upsert_project(uuid, text, uuid, text, text, text, timestamptz);

create or replace function public.connector_upsert_project(
  p_id uuid,
  p_title text,
  p_parent_id uuid default null,
  p_mode_kind text default null,
  p_spec_slug text default null,
  p_sync_hash text default null,
  p_deleted_at timestamptz default null,
  p_organization_id uuid default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.projects;
begin
  perform set_config('app.is_connector', 'on', true);

  insert into public.projects (
    id, name, parent_id, locked, lock_source, mode_kind, spec_slug,
    specs_id, origin, sync_hash, deleted_at, organization_id
  )
  values (
    p_id, p_title, p_parent_id, true, 'specs', p_mode_kind, p_spec_slug,
    p_id, 'specs', p_sync_hash, p_deleted_at, p_organization_id
  )
  on conflict (id) do update set
    name = excluded.name,
    parent_id = excluded.parent_id,
    locked = true,
    lock_source = 'specs',
    mode_kind = excluded.mode_kind,
    spec_slug = excluded.spec_slug,
    specs_id = excluded.specs_id,
    origin = 'specs',
    sync_hash = excluded.sync_hash,
    deleted_at = excluded.deleted_at,
    organization_id = coalesce(excluded.organization_id, public.projects.organization_id),
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.connector_upsert_project(uuid, text, uuid, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.connector_upsert_project(uuid, text, uuid, text, text, text, timestamptz, uuid) to service_role;

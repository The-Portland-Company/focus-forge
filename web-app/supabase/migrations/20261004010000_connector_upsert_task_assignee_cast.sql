-- Fix: connector_upsert_task's p_assignee (text, matches Specs' plain-string
-- assignee field) was being written straight into tasks.assigned_to (uuid)
-- with no cast, so ANY inbound Specs->Forge task event carrying a non-null
-- assignee threw a Postgres 42804 ("column is of type uuid but expression is
-- of type text") inside applyInboundEvent. The route still returned HTTP 200
-- (events are applied in a per-event try/catch, see
-- app/api/connectors/specs/events/route.ts), so Specs' sendOutboxRow saw a
-- 200 and marked the row sent — the write silently never applied. Reproduced
-- live 2026-10-04 by calling this RPC directly with the exact parameters
-- from a real failed sync event.
--
-- nullif(..., '') guards an empty-string assignee (treated as "no assignee"
-- rather than an invalid-uuid cast error); the rest of the function is
-- unchanged from 20261003220000_specs_forge_connectors.sql.
create or replace function public.connector_upsert_task(
  p_id uuid,
  p_goal_id uuid default null,
  p_parent_task_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_acceptance text default null,
  p_order integer default 0,
  p_status text default null,
  p_progress integer default null,
  p_estimate_min integer default null,
  p_time_logged_min integer default null,
  p_due_at timestamptz default null,
  p_start_at timestamptz default null,
  p_assignee text default null,
  p_sync_hash text default null,
  p_deleted_at timestamptz default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.tasks;
  v_project_id uuid;
  v_completed boolean;
  v_assignee uuid;
begin
  perform set_config('app.is_connector', 'on', true);

  if p_goal_id is not null then
    select project_id into v_project_id from public.goals where id = p_goal_id;
  end if;
  v_completed := (p_status = 'done');
  v_assignee := nullif(p_assignee, '')::uuid;

  insert into public.tasks (
    id, goal_id, parent_id, project_id, name, description, acceptance,
    order_index, status, progress, estimate_min, time_logged_min,
    due_date, start_date, assigned_to, completed,
    specs_id, origin, sync_hash, deleted_at, type
  )
  values (
    p_id, p_goal_id, p_parent_task_id, v_project_id, p_title, p_body, p_acceptance,
    p_order, p_status, p_progress, p_estimate_min, p_time_logged_min,
    p_due_at, p_start_at, v_assignee, coalesce(v_completed, false),
    p_id, 'specs', p_sync_hash, p_deleted_at, 'task'
  )
  on conflict (id) do update set
    goal_id = excluded.goal_id,
    parent_id = excluded.parent_id,
    project_id = coalesce(excluded.project_id, public.tasks.project_id),
    name = excluded.name,
    description = excluded.description,
    acceptance = excluded.acceptance,
    order_index = excluded.order_index,
    status = excluded.status,
    progress = excluded.progress,
    estimate_min = excluded.estimate_min,
    time_logged_min = excluded.time_logged_min,
    due_date = excluded.due_date,
    start_date = excluded.start_date,
    assigned_to = excluded.assigned_to,
    completed = excluded.completed,
    specs_id = excluded.specs_id,
    origin = 'specs',
    sync_hash = excluded.sync_hash,
    deleted_at = excluded.deleted_at,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

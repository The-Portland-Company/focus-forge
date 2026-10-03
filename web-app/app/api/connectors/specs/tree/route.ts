import { NextRequest, NextResponse } from 'next/server'
import { verifyMobileAccessTokenOrPat, mobileFailure } from '@/lib/mobile/api'
import { createConnectorServiceSupabase, isConnectorEnabled } from '@/lib/connectors/specs-sync'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connectors/specs/tree (contract §2) -- full current Politogy
 * project tree with sync_hash per row, for the hourly reconcile job (P7).
 */
export async function GET(request: NextRequest) {
  const auth = await verifyMobileAccessTokenOrPat(request.headers.get('authorization'), [
    'read',
    'write',
    'admin',
  ])
  if (!auth.ok) {
    return NextResponse.json(auth.error, { status: auth.status })
  }

  const supabase = createConnectorServiceSupabase()
  const enabled = await isConnectorEnabled(supabase)
  if (!enabled) {
    return NextResponse.json(
      mobileFailure('connector_disabled', 'The specs connector is disabled'),
      { status: 503 },
    )
  }

  const [{ data: projects }, { data: sections }, { data: goals }, { data: tasks }] =
    await Promise.all([
      supabase
        .from('projects')
        .select('id, name, parent_id, locked, mode_kind, spec_slug, sync_hash, deleted_at')
        .eq('locked', true),
      supabase
        .from('sections')
        .select('id, project_id, name, order_index, sync_hash, deleted_at')
        .not('specs_id', 'is', null),
      supabase
        .from('goals')
        .select(
          'id, project_id, section_id, parent_goal_id, name, description, order_index, sync_hash, deleted_at',
        )
        .not('specs_id', 'is', null),
      supabase
        .from('tasks')
        .select(
          'id, goal_id, parent_id, name, description, acceptance, order_index, status, progress, estimate_min, time_logged_min, due_date, start_date, assigned_to, sync_hash, deleted_at',
        )
        .not('specs_id', 'is', null),
    ])

  return NextResponse.json({
    data: {
      projects: projects ?? [],
      sections: sections ?? [],
      goals: goals ?? [],
      tasks: tasks ?? [],
    },
    error: null,
  })
}

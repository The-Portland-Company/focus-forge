import { NextRequest, NextResponse } from 'next/server'
import { requireViewer } from '@/lib/auth/require-viewer'
import { mobileFailure, mobileSuccess } from '@/lib/mobile/api'
import { createConnectorServiceSupabase } from '@/lib/connectors/specs-sync'

export const dynamic = 'force-dynamic'

/** Org > Connectors > Politogy: Specs settings UI reads/writes this. */
export async function GET() {
  const viewer = await requireViewer()
  if (!viewer) {
    return NextResponse.json(mobileFailure('unauthorized', 'Sign in required'), { status: 401 })
  }

  const supabase = createConnectorServiceSupabase()
  const { data, error } = await supabase
    .from('connectors')
    .select('id, enabled, config, last_inbound_at, last_outbound_at, updated_at')
    .eq('id', 'specs')
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json(mobileFailure('not_found', 'specs connector row not found'), {
      status: 404,
    })
  }

  const { count: pending } = await supabase
    .from('sync_outbox')
    .select('id', { count: 'exact', head: true })
    .is('sent_at', null)
    .eq('dead', false)

  const { count: deadLettered } = await supabase
    .from('sync_dead_letters')
    .select('id', { count: 'exact', head: true })

  return NextResponse.json(
    mobileSuccess({
      ...data,
      pending_outbox: pending ?? 0,
      dead_letters: deadLettered ?? 0,
    }),
  )
}

export async function PATCH(request: NextRequest) {
  const viewer = await requireViewer()
  if (!viewer) {
    return NextResponse.json(mobileFailure('unauthorized', 'Sign in required'), { status: 401 })
  }

  let body: { enabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(mobileFailure('invalid_json', 'Body is not valid JSON'), {
      status: 400,
    })
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json(
      mobileFailure('invalid_payload', '"enabled" must be a boolean'),
      { status: 400 },
    )
  }

  const supabase = createConnectorServiceSupabase()
  const { data, error } = await supabase
    .from('connectors')
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq('id', 'specs')
    .select('id, enabled, config, last_inbound_at, last_outbound_at, updated_at')
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json(mobileFailure('update_failed', error?.message ?? 'unknown error'), {
      status: 500,
    })
  }

  return NextResponse.json(mobileSuccess(data))
}

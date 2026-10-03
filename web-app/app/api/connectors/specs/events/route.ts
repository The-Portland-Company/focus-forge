import { NextRequest, NextResponse } from 'next/server'
import { verifyMobileAccessTokenOrPat, mobileFailure } from '@/lib/mobile/api'
import {
  applyInboundEvent,
  createConnectorServiceSupabase,
  isConnectorEnabled,
  verifySignature,
  type SyncEvent,
} from '@/lib/connectors/specs-sync'

export const dynamic = 'force-dynamic'

const MAX_EVENTS_PER_BATCH = 500

/**
 * Specs -> Forge inbound sync (contract §2, §9). Specs pushes a batch of
 * entity events here, authenticated two ways (defense in depth):
 *   - Authorization: Bearer <FORGE_PAT>  (existing personal_access_tokens)
 *   - X-Specs-Forge-Signature: sha256=<hmac>  (shared SPECS_SYNC_SECRET)
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const secret = process.env.SPECS_SYNC_SECRET
  if (!secret) {
    return NextResponse.json(
      mobileFailure('connector_misconfigured', 'SPECS_SYNC_SECRET is not set'),
      { status: 500 },
    )
  }

  const signatureHeader = request.headers.get('x-specs-forge-signature')
  const signatureOk = await verifySignature(secret, rawBody, signatureHeader)
  if (!signatureOk) {
    return NextResponse.json(
      mobileFailure('invalid_signature', 'HMAC signature missing or invalid'),
      { status: 401 },
    )
  }

  const auth = await verifyMobileAccessTokenOrPat(request.headers.get('authorization'), [
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

  let body: { events?: unknown }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(mobileFailure('invalid_json', 'Body is not valid JSON'), {
      status: 400,
    })
  }

  const events = Array.isArray(body.events) ? (body.events as SyncEvent[]) : null
  if (!events) {
    return NextResponse.json(
      mobileFailure('invalid_payload', '"events" must be an array'),
      { status: 400 },
    )
  }
  if (events.length > MAX_EVENTS_PER_BATCH) {
    return NextResponse.json(
      mobileFailure('batch_too_large', `Max ${MAX_EVENTS_PER_BATCH} events per call`),
      { status: 400 },
    )
  }

  const results: Array<{ event_id: string; applied: boolean; reason?: string; error?: string }> =
    []

  for (const event of events) {
    if (
      !event ||
      typeof event.event_id !== 'string' ||
      typeof event.entity !== 'string' ||
      typeof event.entity_id !== 'string' ||
      typeof event.op !== 'string'
    ) {
      results.push({ event_id: String(event?.event_id ?? ''), applied: false, error: 'malformed_event' })
      continue
    }
    try {
      const result = await applyInboundEvent(supabase, event)
      results.push({ event_id: event.event_id, applied: result.applied, reason: result.reason })
    } catch (err) {
      results.push({
        event_id: event.event_id,
        applied: false,
        error: err instanceof Error ? err.message : 'unknown_error',
      })
    }
  }

  await supabase
    .from('connectors')
    .update({ last_inbound_at: new Date().toISOString() })
    .eq('id', 'specs')

  return NextResponse.json({ data: { results }, error: null })
}

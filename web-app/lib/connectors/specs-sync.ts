// Specs <-> Forge sync contract v1 (politogy/docs/sync-contract.md).
//
// This module holds the pieces shared between the inbound webhook route
// (app/api/connectors/specs/events) and its tests: HMAC verification and
// the per-entity "apply an inbound event" logic that calls the
// connector_upsert_* RPCs created in
// supabase/migrations/20261003220000_specs_forge_connectors.sql.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const SYNC_EVENT_VERSION = 1

export type SyncEntity = 'project' | 'section' | 'goal' | 'task'
export type SyncOp = 'create' | 'update' | 'delete' | 'restore'

export type SyncEvent = {
  event_id: string
  origin: 'specs' | 'forge'
  occurred_at: string
  entity: SyncEntity
  op: SyncOp
  entity_id: string
  sync_hash?: string
  data: Record<string, unknown>
}

export const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

export const hmacHex = async (secret: string, body: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return toHex(sig)
}

/**
 * Verifies the `X-Specs-Forge-Signature: sha256=<hex>` header (contract §9)
 * over the exact raw request body bytes.
 */
export const verifySignature = async (
  secret: string,
  rawBody: string,
  headerValue: string | null,
): Promise<boolean> => {
  if (!headerValue) return false
  const match = headerValue.match(/^sha256=([0-9a-f]+)$/i)
  if (!match) return false
  const expected = await hmacHex(secret, rawBody)
  return timingSafeEqual(expected.toLowerCase(), match[1].toLowerCase())
}

export const createConnectorServiceSupabase = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

type SupabaseLike = ReturnType<typeof createConnectorServiceSupabase>

export type ApplyResult = {
  applied: boolean
  reason?: 'duplicate' | 'unknown_entity' | 'rpc_error'
}

/**
 * Applies one inbound Specs event via the matching connector_upsert_*
 * RPC. Idempotent: a previously-seen event_id is recorded in
 * sync_events_seen and short-circuits to { applied: false, reason:
 * 'duplicate' } without re-calling the RPC (contract §2, §9).
 */
export const applyInboundEvent = async (
  supabase: SupabaseLike,
  event: SyncEvent,
): Promise<ApplyResult> => {
  const { data: existing } = await supabase
    .from('sync_events_seen')
    .select('event_id')
    .eq('event_id', event.event_id)
    .maybeSingle()

  if (existing) {
    return { applied: false, reason: 'duplicate' }
  }

  const data = event.data || {}
  const deletedAt =
    event.op === 'delete'
      ? (data.deleted_at as string | undefined) ?? event.occurred_at
      : event.op === 'restore'
        ? null
        : ((data.deleted_at as string | null | undefined) ?? null)

  let rpcError: { message: string } | null = null
  let rpcName = ''

  switch (event.entity) {
    case 'project': {
      rpcName = 'connector_upsert_project'
      const { error } = await supabase.rpc('connector_upsert_project', {
        p_id: event.entity_id,
        p_title: data.title ?? null,
        p_parent_id: data.parent_id ?? null,
        p_mode_kind: data.mode_kind ?? null,
        p_spec_slug: data.spec_slug ?? null,
        p_sync_hash: event.sync_hash ?? null,
        p_deleted_at: deletedAt,
      })
      rpcError = error
      break
    }
    case 'section': {
      rpcName = 'connector_upsert_section'
      const { error } = await supabase.rpc('connector_upsert_section', {
        p_id: event.entity_id,
        p_project_id: data.project_id,
        p_title: data.title ?? null,
        p_order: data.order ?? 0,
        p_sync_hash: event.sync_hash ?? null,
        p_deleted_at: deletedAt,
      })
      rpcError = error
      break
    }
    case 'goal': {
      rpcName = 'connector_upsert_goal'
      const { error } = await supabase.rpc('connector_upsert_goal', {
        p_id: event.entity_id,
        p_project_id: data.project_id,
        p_section_id: data.section_id ?? null,
        p_parent_goal_id: data.parent_goal_id ?? null,
        p_title: data.title ?? null,
        p_body: data.body ?? null,
        p_order: data.order ?? 0,
        p_sync_hash: event.sync_hash ?? null,
        p_deleted_at: deletedAt,
      })
      rpcError = error
      break
    }
    case 'task': {
      rpcName = 'connector_upsert_task'
      const { error } = await supabase.rpc('connector_upsert_task', {
        p_id: event.entity_id,
        p_goal_id: data.goal_id ?? null,
        p_parent_task_id: data.parent_task_id ?? null,
        p_title: data.title ?? null,
        p_body: data.body ?? null,
        p_acceptance: data.acceptance ?? null,
        p_order: data.order ?? 0,
        p_status: data.status ?? null,
        p_progress: data.progress ?? null,
        p_estimate_min: data.estimate_min ?? null,
        p_time_logged_min: data.time_logged_min ?? null,
        p_due_at: data.due_at ?? null,
        p_start_at: data.start_at ?? null,
        p_assignee: data.assignee ?? null,
        p_sync_hash: event.sync_hash ?? null,
        p_deleted_at: deletedAt,
      })
      rpcError = error
      break
    }
    default:
      return { applied: false, reason: 'unknown_entity' }
  }

  // The RPC call itself can fail (constraint violation, bad FK, etc.)
  // without supabase-js throwing -- `error` comes back in the result
  // object instead. Previously this was never checked, so a failed write
  // still fell through to recording the event as applied, a silent
  // no-op: the caller saw { applied: true } and the sync_events_seen
  // idempotency guard then skipped any retry of the same event forever.
  if (rpcError) {
    throw new Error(`rpc_error:${rpcName}: ${rpcError.message}`)
  }

  await supabase.from('sync_events_seen').insert({
    event_id: event.event_id,
    origin: event.origin,
    entity: event.entity,
    entity_id: event.entity_id,
    applied: true,
  })

  return { applied: true }
}

export const isConnectorEnabled = async (supabase: SupabaseLike): Promise<boolean> => {
  const { data } = await supabase
    .from('connectors')
    .select('enabled')
    .eq('id', 'specs')
    .maybeSingle()
  // Fail open only if the row is missing entirely (shouldn't happen post-
  // migration); an explicit false always wins.
  return data ? data.enabled !== false : true
}

import { createClient } from '@supabase/supabase-js'

let _adminClient: any = null

/**
 * Hard ceiling on any single Supabase request from the server.
 *
 * Without this, supabase-js waits forever. On 2026-08-07 the project's API
 * gateway stopped responding and every route that touched the database sat
 * open until Cloudflare's ~100s origin timeout fired and returned a **524** —
 * an opaque error page, no log line, no way for the caller to distinguish
 * "slow" from "dead". A bounded request turns that into a fast, catchable
 * error the route can convert into a real status code.
 *
 * Kept comfortably under Cloudflare's cut so we always answer first.
 */
export const SUPABASE_REQUEST_TIMEOUT_MS = Number(
  process.env.SUPABASE_REQUEST_TIMEOUT_MS || 20000,
)

/**
 * `fetch` with an abort budget, preserving any caller-supplied signal.
 */
function timeoutFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS)
  const signal = init?.signal
    ? // Caller already passed a signal (e.g. a cancelled request) — honour both.
      // `AbortSignal.any` is available on Node 20+, which is what we deploy on.
      AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal
  return fetch(input, { ...init, signal })
}

export function getAdminClient() {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('Supabase admin env vars not available')
    }
    _adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        fetch: timeoutFetch,
      },
    })
  }
  return _adminClient as any
}

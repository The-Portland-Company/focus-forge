import type { createClient } from './client'

// Supabase Realtime authorizes a `postgres_changes` subscription with the
// socket's JWT, the same way PostgREST authorizes a REST request — a socket
// opened with only the anon key has no `auth.uid()`, so RLS silently drops
// every change. Since the browser mints no Supabase session under TPC Auth
// (see lib/auth/tpc-session.ts), every realtime subscriber must fetch the
// short-lived RLS JWT from /api/auth/realtime-token and hand it to
// `supabase.realtime.setAuth()` before subscribing, then refresh it before
// the token's 5-minute expiry.
const TOKEN_TTL_MARGIN_MS = 30_000
const REFRESH_INTERVAL_MS = 4 * 60 * 1000

let cachedToken: { token: string; expires: number } | null = null
let inFlight: Promise<string | null> | null = null

async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/realtime-token', { credentials: 'include' })
    if (!res.ok) return null
    const { token, expiresIn } = (await res.json()) as { token: string; expiresIn: number }
    cachedToken = { token, expires: Date.now() + expiresIn * 1000 }
    return token
  } catch {
    return null
  }
}

async function getRealtimeToken(force = false): Promise<string | null> {
  if (!force && cachedToken && cachedToken.expires - Date.now() > TOKEN_TTL_MARGIN_MS) {
    return cachedToken.token
  }
  if (inFlight) return inFlight
  inFlight = fetchToken().finally(() => {
    inFlight = null
  })
  return inFlight
}

/**
 * Authenticates `supabase`'s realtime socket with the caller's RLS JWT and
 * keeps it refreshed. Await the returned promise before opening any channel
 * so the first subscribe carries a valid token; call the returned cleanup
 * function from the effect that owns this client.
 */
export function authenticateRealtime(
  supabase: ReturnType<typeof createClient>,
): { ready: Promise<void>; stop: () => void } {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const refresh = async (force: boolean) => {
    const token = await getRealtimeToken(force)
    if (cancelled) return
    if (token) await supabase.realtime.setAuth(token)
    timer = setTimeout(() => void refresh(true), REFRESH_INTERVAL_MS)
  }

  const ready = refresh(false)

  return {
    ready,
    stop: () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    },
  }
}

import { useEffect, useState } from 'react'
import { createClient } from './client'
import { authenticateRealtime } from './realtime-auth'

// The browser no longer holds a Supabase session — auth is via TPC Auth
// (httpOnly cookies; see lib/auth/tpc-session.ts), and there is no client-side
// Supabase JWT to read `supabase.auth.getSession()` out of. `/api/auth/me` is
// the browser-side replacement: it resolves the viewer server-side
// (RLS-scoped) and returns their identity plus `profiles` / `user_preferences`
// rows in one call. Live updates come from a realtime subscription
// authenticated via /api/auth/realtime-token (lib/supabase/realtime-auth.ts),
// same as hooks/use-tasks-realtime.ts / use-email-realtime.ts.
export type ViewerUser = { id: string; email: string | null }

type MeResponse = {
  user: ViewerUser | null
  profile: any | null
  preferences: any | null
}

/**
 * Module-level, per-tab shared store so that multiple mounted components
 * (e.g. email-inbox-view + theme-mode-toggle + dock-badge-sync all rendering
 * at once) share ONE `/api/auth/me` fetch instead of each issuing its own.
 */
let sharedPromise: Promise<MeResponse> | null = null
let sharedData: MeResponse | null = null
const listeners = new Set<(data: MeResponse | null) => void>()

async function fetchMe(force = false): Promise<MeResponse> {
  if (sharedPromise && !force) return sharedPromise
  sharedPromise = (async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      const data: MeResponse = res.ok
        ? await res.json()
        : { user: null, profile: null, preferences: null }
      sharedData = data
      listeners.forEach((l) => l(data))
      return data
    } finally {
      sharedPromise = null
    }
  })()
  return sharedPromise
}

/** Re-fetch `/api/auth/me` and notify subscribers. Call after any mutation. */
export function refreshViewer() {
  return fetchMe(true)
}

/**
 * Subscribe to the shared `/api/auth/me` result outside a component (e.g.
 * AuthContext applying the viewer's theme once their profile loads). Fires
 * once immediately with the current snapshot if one exists, then on every
 * refresh. Returns an unsubscribe function.
 */
export function subscribeViewer(listener: (data: MeResponse | null) => void) {
  listeners.add(listener)
  if (sharedData) listener(sharedData)
  else void fetchMe().then(listener)
  return () => listeners.delete(listener)
}

/**
 * Ref-counted realtime subscription for the viewer's own `profiles` /
 * `user_preferences` rows, shared across every mounted `useMe()` consumer so
 * only one channel is ever open per tab. Mirrors hooks/use-tasks-realtime.ts:
 * authenticate the socket via /api/auth/realtime-token before subscribing,
 * then refetch /api/auth/me on any change.
 */
let realtimeUserId: string | null = null
let realtimeRefCount = 0
let realtimeAuthHandle: ReturnType<typeof authenticateRealtime> | null = null
let realtimeClient: ReturnType<typeof createClient> | null = null
let realtimeChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

function acquireRealtime(userId: string) {
  if (realtimeUserId === userId) {
    realtimeRefCount++
    return
  }
  releaseRealtimeChannel()
  realtimeUserId = userId
  realtimeRefCount = 1

  const supabase = createClient()
  realtimeClient = supabase
  const auth = authenticateRealtime(supabase)
  realtimeAuthHandle = auth

  void auth.ready.then(() => {
    if (realtimeUserId !== userId || realtimeClient !== supabase) return
    realtimeChannel = supabase
      .channel(`viewer-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => void refreshViewer(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_preferences', filter: `user_id=eq.${userId}` },
        () => void refreshViewer(),
      )
      .subscribe()
  })
}

function releaseRealtimeChannel() {
  if (realtimeAuthHandle) realtimeAuthHandle.stop()
  if (realtimeClient && realtimeChannel) void realtimeClient.removeChannel(realtimeChannel)
  realtimeAuthHandle = null
  realtimeClient = null
  realtimeChannel = null
  realtimeUserId = null
}

function releaseRealtime(userId: string) {
  if (realtimeUserId !== userId) return
  realtimeRefCount--
  if (realtimeRefCount <= 0) releaseRealtimeChannel()
}

function useMe() {
  const [data, setData] = useState<MeResponse | null>(sharedData)
  const [loading, setLoading] = useState(!sharedData)

  useEffect(() => {
    const listener = (d: MeResponse | null) => {
      setData(d)
      setLoading(false)
    }
    listeners.add(listener)

    if (sharedData) {
      setData(sharedData)
      setLoading(false)
    } else {
      fetchMe().then(listener)
    }

    return () => {
      listeners.delete(listener)
    }
  }, [])

  const userId = data?.user?.id ?? null
  useEffect(() => {
    if (typeof window === 'undefined' || !userId) return
    acquireRealtime(userId)
    return () => releaseRealtime(userId)
  }, [userId])

  return { data, loading }
}

export function useSupabaseUser() {
  const { data, loading } = useMe()
  return { user: data?.user ?? null, loading }
}

async function patchMe(table: 'profile' | 'preferences', updates: any) {
  const res = await fetch('/api/auth/me', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, updates }),
  })
  if (res.ok) {
    void refreshViewer()
    return { error: null }
  }
  const body = await res.json().catch(() => null)
  return { error: body?.error ?? 'Update failed' }
}

export function useUserProfile() {
  const { data, loading } = useMe()

  return {
    profile: data?.profile ?? null,
    loading,
    updateProfile: async (updates: any) => {
      if (!data?.user) return
      return patchMe('profile', updates)
    },
  }
}

export function useUserPreferences() {
  const { data, loading } = useMe()

  return {
    preferences: data?.preferences ?? null,
    loading,
    updatePreferences: async (updates: any) => {
      if (!data?.user) return
      return patchMe('preferences', updates)
    },
  }
}

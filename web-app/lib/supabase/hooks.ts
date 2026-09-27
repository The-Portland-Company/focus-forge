import { useEffect, useState } from 'react'

// The browser no longer holds a Supabase session — auth is via TPC Auth
// (httpOnly cookies; see lib/auth/tpc-session.ts), and there is no client-side
// Supabase JWT to read `supabase.auth.getSession()` out of, or to authenticate
// a `postgres_changes` realtime subscription with. `/api/auth/me` is the
// browser-side replacement: it resolves the viewer server-side (RLS-scoped)
// and returns their identity plus `profiles` / `user_preferences` rows in one
// call. Realtime push is gone for now — data refreshes on mount and after any
// mutation this hook makes; see the final report for the gap this leaves.
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

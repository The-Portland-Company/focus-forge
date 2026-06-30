import { useEffect, useState } from 'react'
import { createClient } from './client'
import type { User } from '@supabase/supabase-js'

export function useSupabaseUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const loadUser = async () => {
      // getSession() reads the user out of the locally-stored JWT/session and
      // does NOT make a network round-trip to the Auth server (auth.users),
      // unlike getUser(). This hook is instantiated by many components at once
      // (useUserProfile / useUserPreferences each call it), so getUser() here
      // multiplied auth.users egress on every page. The JWT identity is
      // sufficient for client-side UI; security-sensitive checks happen
      // server-side with RLS / getUser() in route handlers.
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    loadUser()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}

/**
 * Module-level, per-user shared store so that multiple mounted components
 * (e.g. email-inbox-view + theme-mode-toggle + dock-badge-sync all rendering at
 * once) share ONE profiles fetch and ONE realtime channel instead of each
 * issuing its own select + websocket. Reference-counted so the channel is torn
 * down when the last subscriber unmounts.
 */
type Store<T> = {
  data: T | null
  loading: boolean
  promise: Promise<void> | null
  refCount: number
  channel: ReturnType<ReturnType<typeof createClient>['channel']> | null
  listeners: Set<(data: T | null, loading: boolean) => void>
}

function createSharedStore<T>(opts: {
  fetch: (
    supabase: ReturnType<typeof createClient>,
    userId: string,
  ) => Promise<T | null>
  channelName: string
  table: string
  filter: (userId: string) => string
}) {
  const stores = new Map<string, Store<T>>()

  function getStore(userId: string): Store<T> {
    let store = stores.get(userId)
    if (!store) {
      store = {
        data: null,
        loading: true,
        promise: null,
        refCount: 0,
        channel: null,
        listeners: new Set(),
      }
      stores.set(userId, store)
    }
    return store
  }

  function emit(store: Store<T>) {
    store.listeners.forEach((l) => l(store.data, store.loading))
  }

  async function load(userId: string, force = false) {
    const supabase = createClient()
    const store = getStore(userId)
    if (store.promise && !force) {
      return store.promise
    }
    store.promise = (async () => {
      try {
        const data = await opts.fetch(supabase, userId)
        if (data !== null && data !== undefined) {
          store.data = data
        }
      } finally {
        store.loading = false
        store.promise = null
        emit(store)
      }
    })()
    return store.promise
  }

  function subscribe(
    userId: string,
    listener: (data: T | null, loading: boolean) => void,
  ) {
    const supabase = createClient()
    const store = getStore(userId)
    store.refCount += 1
    store.listeners.add(listener)

    // Kick off the shared fetch only once.
    if (store.refCount === 1 || (!store.data && !store.promise)) {
      void load(userId)
    } else {
      // Late subscriber gets current snapshot immediately.
      listener(store.data, store.loading)
    }

    // Open a single shared realtime channel for this user.
    if (!store.channel) {
      store.channel = supabase
        .channel(`${opts.channelName}-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: opts.table,
            filter: opts.filter(userId),
          },
          () => {
            void load(userId, true)
          },
        )
        .subscribe()
    }

    return () => {
      store.refCount -= 1
      store.listeners.delete(listener)
      if (store.refCount <= 0) {
        if (store.channel) {
          void supabase.removeChannel(store.channel)
          store.channel = null
        }
        stores.delete(userId)
      }
    }
  }

  function setLocal(userId: string, updates: Partial<T>) {
    const store = stores.get(userId)
    if (!store) return
    store.data = { ...(store.data as any), ...updates }
    emit(store)
  }

  return { subscribe, setLocal }
}

const profileStore = createSharedStore<any>({
  fetch: async (supabase, userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return error ? null : data
  },
  channelName: 'profile-changes',
  table: 'profiles',
  filter: (userId) => `id=eq.${userId}`,
})

export function useUserProfile() {
  const { user } = useSupabaseUser()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }
    const unsubscribe = profileStore.subscribe(user.id, (data, isLoading) => {
      setProfile(data)
      setLoading(isLoading)
    })
    return unsubscribe
  }, [user])

  return {
    profile,
    loading,
    updateProfile: async (updates: any) => {
      if (!user) return
      const supabase = createClient()
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)

      if (!error) {
        profileStore.setLocal(user.id, updates)
      }
      return { error }
    },
  }
}

const preferencesStore = createSharedStore<any>({
  fetch: async (supabase, userId) => {
    let { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code === 'PGRST116') {
      const { data: newData, error: insertError } = await supabase
        .from('user_preferences')
        .insert({
          user_id: userId,
          expanded_organizations: [],
        })
        .select()
        .single()

      if (!insertError && newData) {
        data = newData
      }
    }

    return data ?? null
  },
  channelName: 'preferences-changes',
  table: 'user_preferences',
  filter: (userId) => `user_id=eq.${userId}`,
})

export function useUserPreferences() {
  const { user } = useSupabaseUser()
  const [preferences, setPreferences] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setPreferences(null)
      setLoading(false)
      return
    }
    const unsubscribe = preferencesStore.subscribe(user.id, (data, isLoading) => {
      setPreferences(data)
      setLoading(isLoading)
    })
    return unsubscribe
  }, [user])

  return {
    preferences,
    loading,
    updatePreferences: async (updates: any) => {
      if (!user) return
      const supabase = createClient()
      const { error } = await supabase
        .from('user_preferences')
        .update(updates)
        .eq('user_id', user.id)

      if (!error) {
        preferencesStore.setLocal(user.id, updates)
      }
      return { error }
    },
  }
}

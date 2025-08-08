import { useEffect, useState } from 'react'
import { createClient } from './client'
import type { User } from '@supabase/supabase-js'

export function useSupabaseUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    getUser()

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

    const supabase = createClient()

    const getProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!error && data) {
        setProfile(data)
      }
      setLoading(false)
    }

    getProfile()

    const channel = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        () => {
          getProfile()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  return { profile, loading, updateProfile: async (updates: any) => {
    if (!user) return
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
    
    if (!error) {
      setProfile((prev: any) => ({ ...prev, ...updates }))
    }
    return { error }
  }}
}

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

    const supabase = createClient()

    const getPreferences = async () => {
      let { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code === 'PGRST116') {
        // No preferences found, create default
        const { data: newData, error: insertError } = await supabase
          .from('user_preferences')
          .insert({
            user_id: user.id,
            expanded_organizations: []
          })
          .select()
          .single()

        if (!insertError && newData) {
          data = newData
        }
      }

      if (data) {
        setPreferences(data)
      }
      setLoading(false)
    }

    getPreferences()

    const channel = supabase
      .channel('preferences-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_preferences',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          getPreferences()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
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
        setPreferences((prev: any) => ({ ...prev, ...updates }))
      }
      return { error }
    }
  }
}
'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { applyTheme, readStoredThemePreference } from '@/lib/theme-utils'

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    let cancelled = false
    let subscription: { unsubscribe: () => void } | null = null

    const applyProfileTheme = async (userId: string) => {
      // Never let a hung profiles query block auth.loading forever.
      const profilePromise = supabase
        .from('profiles')
        .select('profile_color, animations_enabled, theme_preset')
        .eq('id', userId)
        .single()
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 4000)
      })
      const result = await Promise.race([profilePromise, timeoutPromise])
      if (!result || cancelled) return
      const { data: profile } = result as { data: {
        profile_color?: string | null
        animations_enabled?: boolean | null
        theme_preset?: string | null
      } | null }
      if (!profile) return
      const themePreset = readStoredThemePreference(
        profile.theme_preset,
        userId,
      )
      applyTheme(
        themePreset,
        profile.profile_color || undefined,
        profile.animations_enabled ?? true
      )
    }

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Error getting session:', error)
          // Clear any invalid session data
          await supabase.auth.signOut()
          if (!cancelled) {
            setUser(null)
            setLoading(false)
          }
          return
        }
        
        if (!cancelled) setUser(session?.user ?? null)
        
        // Apply theme from profile if user is logged in
        if (session?.user) {
          await applyProfileTheme(session.user.id)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (cancelled) return
        if (event === 'SIGNED_OUT') {
          setUser(null)
          return
        }

        setUser(session?.user ?? null)

        // Only fetch the profile (theme) on an actual new sign-in. The initial
        // load is already handled above, and TOKEN_REFRESHED / INITIAL_SESSION
        // fire repeatedly (token refresh runs ~hourly) — refetching the profile
        // on every one of those events was a large source of duplicate
        // public.profiles egress.
        if (event === 'SIGNED_IN' && session?.user) {
          await applyProfileTheme(session.user.id)
        }
      })
      subscription = data.subscription
    }

    void initAuth()
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { error }
  }

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  const refreshSession = async () => {
    const supabase = createClient()
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession()
      if (error) {
        console.error('Error refreshing session:', error)
        // If refresh fails, sign out the user
        await signOut()
      } else {
        setUser(session?.user ?? null)
      }
    } catch (error) {
      console.error('Session refresh error:', error)
      await signOut()
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

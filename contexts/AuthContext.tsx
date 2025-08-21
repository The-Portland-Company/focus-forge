'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { applyUserTheme } from '@/lib/theme-utils'

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

  const supabase = createClient()

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Error getting session:', error)
          // Clear any invalid session data
          await supabase.auth.signOut()
          setUser(null)
          setLoading(false)
          return
        }
        
        setUser(session?.user ?? null)
        
        // Apply theme from profile if user is logged in
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('profile_color, animations_enabled')
            .eq('id', session.user.id)
            .single()
          
          if (profile) {
            applyUserTheme(profile.profile_color || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', profile.animations_enabled ?? true)
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state change:', event)
        
        if (event === 'TOKEN_REFRESHED') {
          console.log('Token refreshed successfully')
        }
        
        if (event === 'SIGNED_OUT') {
          setUser(null)
          return
        }
        
        setUser(session?.user ?? null)
        
        // Apply theme on auth state change
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('profile_color, animations_enabled')
            .eq('id', session.user.id)
            .single()
          
          if (profile) {
            applyUserTheme(profile.profile_color || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', profile.animations_enabled ?? true)
          }
        }
      })

      return () => subscription.unsubscribe()
    }

    initAuth()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const refreshSession = async () => {
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
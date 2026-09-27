'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { applyTheme, readStoredThemePreference } from '@/lib/theme-utils'
import { clearCachedDatabase } from '@/lib/database-cache'
import { subscribeViewer, useSupabaseUser, type ViewerUser } from '@/lib/supabase/hooks'

interface AuthContextType {
  user: ViewerUser | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  // The browser holds no Supabase session under TPC Auth — `user`/`loading`
  // come from `/api/auth/me` via the shared store in lib/supabase/hooks.ts
  // (same source useSupabaseUser/useUserProfile/useUserPreferences use), so
  // this doesn't duplicate that fetch.
  const { user, loading } = useSupabaseUser()

  useEffect(() => {
    // Apply the signed-in user's theme once their profile arrives. Mirrors
    // the old SIGNED_IN handler, driven off the same shared viewer fetch.
    if (!user) return
    let cancelled = false
    const unsubscribe = subscribeViewer((data) => {
      if (cancelled || !data?.profile) return
      const { profile_color, animations_enabled, theme_preset } = data.profile
      const themePreset = readStoredThemePreference(theme_preset, user.id)
      applyTheme(themePreset, profile_color || undefined, animations_enabled ?? true)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [user])

  const signOut = async () => {
    // The database snapshot lives in localStorage (it outlives the session),
    // so an explicit sign-out must drop it.
    clearCachedDatabase(user?.id)
    clearCachedDatabase(null)
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/auth/login'
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
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

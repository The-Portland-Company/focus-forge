'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  userProfile: UserProfile | null
  selectedOrganizationId: string | null
  setSelectedOrganizationId: (id: string) => void
}

interface UserProfile {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: 'super_admin' | 'admin' | 'team_member'
  profileColor: string
  animationsEnabled: boolean
  organizations: string[]
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          setUser(session.user)
          await loadUserProfile(session.user.id)
        }
      } catch (error) {
        console.error('Error checking auth:', error)
      } finally {
        setLoading(false)
      }
    }

    checkUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user)
        await loadUserProfile(session.user.id)
      } else {
        setUser(null)
        setUserProfile(null)
        setSelectedOrganizationId(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadUserProfile = async (userId: string) => {
    try {
      // Load user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError

      // Load user organizations
      const { data: userOrgs, error: orgsError } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', userId)

      if (orgsError) throw orgsError

      const organizationIds = userOrgs.map(uo => uo.organization_id)

      const userProfileData: UserProfile = {
        id: profile.id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: profile.role,
        profileColor: profile.profile_color,
        animationsEnabled: profile.animations_enabled,
        organizations: organizationIds
      }

      setUserProfile(userProfileData)

      // Set default organization if not selected
      if (!selectedOrganizationId && organizationIds.length > 0) {
        setSelectedOrganizationId(organizationIds[0])
      }

      // Apply user theme
      applyUserTheme(profile.profile_color, profile.animations_enabled)
    } catch (error) {
      console.error('Error loading user profile:', error)
    }
  }

  const applyUserTheme = (color: string, animationsEnabled: boolean) => {
    const root = document.documentElement
    let primaryColor = color
    
    // Handle gradients
    if (color.startsWith('linear-gradient')) {
      const matches = color.match(/#[A-Fa-f0-9]{6}/g)
      if (matches && matches.length > 0) {
        primaryColor = matches[0]
        root.style.setProperty('--user-profile-color', primaryColor)
        root.style.setProperty('--user-profile-gradient', color)
        root.style.setProperty('--theme-gradient', color)
      }
    } else {
      root.style.setProperty('--user-profile-color', color)
      root.style.setProperty('--user-profile-gradient', color)
      root.style.setProperty('--theme-primary', color)
      root.style.setProperty('--theme-gradient', color)
    }
    
    // Convert hex to RGB for use in rgba()
    // Only convert if primaryColor is a valid hex color
    if (primaryColor.startsWith('#') && primaryColor.length === 7) {
      const hex = primaryColor.replace('#', '')
      const r = parseInt(hex.substr(0, 2), 16)
      const g = parseInt(hex.substr(2, 2), 16)
      const b = parseInt(hex.substr(4, 2), 16)
      
      // Check for NaN values
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        root.style.setProperty('--user-profile-color-rgb', `${r}, ${g}, ${b}`)
        root.style.setProperty('--theme-primary-rgb', `${r}, ${g}, ${b}`)
      } else {
        // Fallback to default orange color RGB
        root.style.setProperty('--user-profile-color-rgb', '234, 88, 12')
        root.style.setProperty('--theme-primary-rgb', '234, 88, 12')
      }
    } else {
      // Fallback to default orange color RGB
      root.style.setProperty('--user-profile-color-rgb', '234, 88, 12')
      root.style.setProperty('--theme-primary-rgb', '234, 88, 12')
    }
    
    // Toggle animations
    if (animationsEnabled) {
      root.classList.remove('no-animations')
    } else {
      root.classList.add('no-animations')
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { error }
      }

      router.push('/today')
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
      router.push('/auth/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn,
      signOut,
      userProfile,
      selectedOrganizationId,
      setSelectedOrganizationId
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
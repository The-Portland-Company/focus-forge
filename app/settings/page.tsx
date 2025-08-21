"use client"

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, User, Building2, Edit } from 'lucide-react'
import { ThemePicker } from '@/components/theme-picker'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { OrganizationSettingsModal } from '@/components/organization-settings-modal'
import { Database, Organization } from '@/lib/types'
import { getBackgroundStyle } from '@/lib/style-utils'
import { useUserProfile } from '@/lib/supabase/hooks'
import { applyUserTheme, applyTheme } from '@/lib/theme-utils'
import { ThemePreset, DEFAULT_THEME_PRESET } from '@/lib/theme-constants'
import { useToast } from '@/contexts/ToastContext'

export default function SettingsPage() {
  const router = useRouter()
  const { showSuccess, showError, showInfo, showWarning } = useToast()
  const [database, setDatabase] = useState<Database | null>(null)
  // Initialize with null to avoid hydration mismatch
  const [profileColor, setProfileColor] = useState<string | null>(null)
  const [themePreset, setThemePreset] = useState<ThemePreset>(DEFAULT_THEME_PRESET)
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null)
  const themePickerRef = useRef<HTMLDivElement>(null)
  const { profile, loading: profileLoading, updateProfile } = useUserProfile()

  useEffect(() => {
    fetchData()
  }, [])

  // Close theme picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themePickerRef.current && !themePickerRef.current.contains(event.target as Node)) {
        setShowThemePicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const fetchData = async () => {
    try {
      const response = await fetch('/api/database', {
        credentials: 'include'
      })
      const data = await response.json()
      setDatabase(data)
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  // Load profile settings from Supabase
  useEffect(() => {
    if (profile && !profileLoading) {
      const userColor = profile.profile_color || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      const userAnimations = profile.animations_enabled !== false
      const userTheme = (profile.theme_preset as ThemePreset) || DEFAULT_THEME_PRESET
      
      setProfileColor(userColor)
      setAnimationsEnabled(userAnimations)
      setThemePreset(userTheme)
      
      // Apply complete theme immediately when profile loads
      applyTheme(userTheme, userColor, userAnimations)
    }
  }, [profile, profileLoading])

  const handleAutoSave = async (updates: { 
    profileColor?: string; 
    animationsEnabled?: boolean; 
    themePreset?: ThemePreset 
  }) => {
    setSaveStatus('saving')
    try {
      // Apply theme immediately for instant feedback
      const currentTheme = updates.themePreset ?? themePreset
      const currentColor = updates.profileColor ?? profileColor
      const currentAnimations = updates.animationsEnabled ?? animationsEnabled ?? true
      
      applyTheme(currentTheme, currentColor || undefined, currentAnimations)
      
      if (updateProfile) {
        // Update profile in Supabase
        const profileUpdates: any = {}
        if (updates.profileColor !== undefined) {
          profileUpdates.profile_color = updates.profileColor
        }
        if (updates.animationsEnabled !== undefined) {
          profileUpdates.animations_enabled = updates.animationsEnabled
        }
        if (updates.themePreset !== undefined) {
          profileUpdates.theme_preset = updates.themePreset
        }
        
        const result = await updateProfile(profileUpdates)
        const error = result?.error
        
        if (!error) {
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        } else {
          setSaveStatus('error')
          setTimeout(() => setSaveStatus('idle'), 3000)
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }


  // Theme application is now handled by the shared utility

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          {saveStatus !== 'idle' && (
            <div className={`text-sm transition-opacity ${
              saveStatus === 'saving' ? 'text-zinc-400' : 
              saveStatus === 'saved' ? 'text-green-400' : 
              'text-red-400'
            }`}>
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && '✓ Saved'}
              {saveStatus === 'error' && 'Error saving'}
            </div>
          )}
        </div>

        <div className="space-y-12">
          {/* Your Profile Section */}
          <div>
            <h2 className="text-xl font-semibold mb-6">Your Profile</h2>
            <div className="space-y-6">
              {/* Theme Settings */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Theme & Appearance
                </h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Choose your theme style and customize colors. Your selection affects the entire application appearance.
                </p>
                <ThemeSwitcher
                  currentTheme={themePreset}
                  currentColor={profileColor || undefined}
                  onThemeChange={async (theme) => {
                    setThemePreset(theme)
                    await handleAutoSave({ themePreset: theme })
                  }}
                  onColorChange={async (color) => {
                    setProfileColor(color)
                    await handleAutoSave({ profileColor: color })
                  }}
                />
              </div>

              {/* Animations */}
              <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                <h3 className="text-lg font-medium mb-4">Animations</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={animationsEnabled ?? true}
                    onChange={async (e) => {
                      const enabled = e.target.checked
                      setAnimationsEnabled(enabled)
                      await handleAutoSave({ animationsEnabled: enabled })
                    }}
                    className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 focus:ring-offset-zinc-900"
                  />
                  <div>
                    <p className="text-white">Enable animations</p>
                    <p className="text-sm text-zinc-400">
                      Includes swirling gradients and other visual effects
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>


          {/* Organizations Section */}
          <div>
            <h2 className="text-xl font-semibold mb-6">Organizations</h2>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800">
              {database?.organizations && database.organizations.length > 0 ? (
                <div className="divide-y divide-zinc-800">
                  {database.organizations.map(org => (
                    <div key={org.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex-shrink-0" 
                          style={{ backgroundColor: org.color }} 
                        />
                        <div>
                          <h3 className="font-medium flex items-center gap-2">
                            {org.name}
                            {org.ownerId === database.users?.[0]?.id && (
                              <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">Owner</span>
                            )}
                          </h3>
                          {org.description && (
                            <p className="text-sm text-zinc-400">{org.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-zinc-500">
                              {database.projects.filter(p => p.organizationId === org.id).length} projects
                            </p>
                            {org.memberIds && org.memberIds.length > 0 && (
                              <>
                                <span className="text-xs text-zinc-600">•</span>
                                <p className="text-xs text-zinc-500">
                                  {org.memberIds.length} {org.memberIds.length === 1 ? 'member' : 'members'}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedOrganization(org)}
                        className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-zinc-500">
                  No organizations found
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
      
      {/* Organization Settings Modal */}
      {selectedOrganization && database && (
        <OrganizationSettingsModal
          organization={selectedOrganization}
          projects={database.projects.filter(p => p.organizationId === selectedOrganization.id)}
          allProjects={database.projects}
          users={database.users}
          currentUserId={database.users?.[0]?.id}
          onClose={() => setSelectedOrganization(null)}
          onSave={async (updates) => {
            try {
              const response = await fetch(`/api/organizations/${selectedOrganization.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
              })
              
              if (response.ok) {
                // Refresh data
                await fetchData()
                setSelectedOrganization(null)
              }
            } catch (error) {
              console.error('Error updating organization:', error)
            }
          }}
          onProjectAssociation={async (projectId, organizationIds) => {
            try {
              const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId: organizationIds[0] }) // For now, just use the first org
              })
              
              if (response.ok) {
                // Refresh data
                await fetchData()
              }
            } catch (error) {
              console.error('Error updating project association:', error)
            }
          }}
          onUserInvite={async (email, organizationId, firstName, lastName) => {
            try {
              // Get organization name for the invitation
              const org = database.organizations.find(o => o.id === organizationId)
              const organizationName = org?.name || 'Organization'
              
              const response = await fetch('/api/invite-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email,
                  organizationId,
                  organizationName,
                  firstName,
                  lastName
                })
              })
              
              const result = await response.json()
              
              if (response.ok) {
                // Refresh data to show the pending user
                await fetchData()
                
                // Show appropriate message based on whether email was sent
                showSuccess(
                  'Invitation sent!',
                  `Email sent to ${firstName} ${lastName} (${email})`
                )
              } else {
                // Show error with helpful information
                if (result.helpUrl) {
                  showError(
                    'Email not configured',
                    'Please configure SMTP settings in Supabase dashboard to send invitation emails'
                  )
                } else {
                  showError('Invitation failed', result.error || 'Failed to send invitation')
                }
              }
            } catch (error) {
              console.error('Error inviting user:', error)
              showError('Invitation failed', 'Failed to send invitation. Please try again.')
            }
          }}
          onUserAdd={async (userId, organizationId) => {
            try {
              // Get current organization
              const org = database.organizations.find(o => o.id === organizationId)
              if (!org) return
              
              // Add user to organization members
              const updatedMemberIds = [...(org.memberIds || []), userId]
              
              const response = await fetch(`/api/organizations/${organizationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberIds: updatedMemberIds })
              })
              
              if (response.ok) {
                await fetchData()
              }
            } catch (error) {
              console.error('Error adding user to organization:', error)
            }
          }}
          onUserRemove={async (userId, organizationId) => {
            try {
              // Get current organization
              const org = database.organizations.find(o => o.id === organizationId)
              if (!org) return
              
              // Remove user from organization members
              const updatedMemberIds = (org.memberIds || []).filter(id => id !== userId)
              
              const response = await fetch(`/api/organizations/${organizationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberIds: updatedMemberIds })
              })
              
              if (response.ok) {
                await fetchData()
              }
            } catch (error) {
              console.error('Error removing user from organization:', error)
            }
          }}
          onSendReminder={async (userId, organizationId) => {
            try {
              // Get the user and organization details
              const user = database.users.find(u => u.id === userId)
              const org = database.organizations.find(o => o.id === organizationId)
              
              if (!user || !org) {
                showError('Error', 'User or organization not found')
                throw new Error('User or organization not found')
              }
              
              // Show initial status
              showInfo('Sending reminder...', `Preparing to send email to ${user.firstName} ${user.lastName}`)
              
              const response = await fetch('/api/send-reminder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: user.email,
                  organizationId,
                  organizationName: org.name,
                  firstName: user.firstName,
                  lastName: user.lastName
                })
              })
              
              const result = await response.json()
              
              if (response.ok) {
                await fetchData()
                
                // Check if email was actually sent or just recorded
                if (result.delivered) {
                  // Email actually sent and delivered (Supabase with SMTP)
                  showSuccess(
                    'Reminder sent!',
                    `Email delivered to ${user.firstName} ${user.lastName} (${user.email})`
                  )
                  return { delivered: true }
                } else {
                  // Email queued but not yet delivered
                  showInfo(
                    'Reminder queued',
                    `Email queued for ${user.firstName} ${user.lastName}. Delivery pending.`
                  )
                  // In production, would poll for actual delivery status
                  // For now, just clear the loading state after a delay
                  return new Promise((resolve) => {
                    setTimeout(() => resolve({ delivered: false }), 2000)
                  })
                }
              } else {
                // Show error with helpful information
                if (result.details?.includes('already registered')) {
                  showWarning(
                    'Already registered',
                    `${user.firstName} ${user.lastName} has already accepted their invitation`
                  )
                } else if (result.helpUrl) {
                  showError(
                    'Email not configured',
                    'Please configure SMTP settings in Supabase dashboard to send reminder emails'
                  )
                } else {
                  showError('Reminder failed', result.error || 'Failed to send reminder')
                }
                throw new Error(result.error || 'Failed to send reminder')
              }
            } catch (error) {
              console.error('Error sending reminder:', error)
              showError('Reminder failed', 'Failed to send reminder. Please try again.')
              throw error
            }
          }}
        />
      )}
    </div>
  )
}
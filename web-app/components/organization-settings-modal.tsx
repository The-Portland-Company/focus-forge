"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Search, Building2, Check, Users, Trash2, Loader2, RotateCcw, Mail, Link2 } from 'lucide-react'
import { Organization, Project, User } from '@/lib/types'
import { ColorPicker } from './color-picker'
import { UserAvatar } from '@/components/user-avatar'
import { type ApiKeyMeta, ALLOWED_API_SCOPES } from '@/lib/api/keys/types'
import { getRichTextPreview, richTextToPlainText } from '@/lib/rich-text'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExistingMemberPicker, filterAvailableMembers } from '@/components/existing-member-picker'

export interface OrganizationInviteResult {
  userId?: string
  email: string
  firstName: string
  lastName: string
  emailDelivery?: {
    provider?: string | null
    messageId?: string | null
  } | null
}

export interface InviteActionResult {
  message?: string
  emailDelivery?: {
    provider?: string | null
    messageId?: string | null
  } | null
}

export function getOrganizationUserIds(organization: Organization): string[] {
  const ids = new Set(organization.memberIds || [])
  if (organization.ownerId) {
    ids.add(organization.ownerId)
  }
  return Array.from(ids)
}

export function buildPendingOrganizationUser(
  invite: OrganizationInviteResult,
): User {
  const firstName = invite.firstName.trim()
  const lastName = invite.lastName.trim()
  const fullName = `${firstName} ${lastName}`.trim()
  const now = new Date().toISOString()

  return {
    id: invite.userId || `pending:${invite.email.toLowerCase()}`,
    firstName,
    lastName,
    name: fullName || invite.email,
    email: invite.email,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
  }
}

export function mergeUsersById(users: User[], extraUsers: User[]): User[] {
  const merged = new Map<string, User>()

  for (const user of users) {
    merged.set(user.id, user)
  }

  for (const user of extraUsers) {
    if (!merged.has(user.id)) {
      merged.set(user.id, user)
    }
  }

  return Array.from(merged.values())
}

interface OrganizationSettingsModalProps {
  organization: Organization
  projects: Project[]
  allProjects: Project[]
  users: User[]
  currentUserId?: string
  currentUserRole?: User['role']
  canManageApiKeys?: boolean
  initialActiveTab?: "details" | "projects" | "users" | "api-keys"
  onClose: () => void
  onSave: (updates: Partial<Organization>) => void
  onProjectAssociation: (projectId: string, organizationIds: string[]) => void
  onUserInvite?: (
    email: string,
    organizationId: string,
    firstName: string,
    lastName: string,
  ) => Promise<OrganizationInviteResult | null | void>
  onUserAdd?: (userId: string, organizationId: string) => void
  onUserRemove?: (userId: string, organizationId: string) => void
  onUserRoleChange?: (
    userId: string,
    organizationId: string,
    role: NonNullable<User['role']>,
  ) => void
  onResendInvite?: (
    userId: string,
    organizationId: string,
  ) => Promise<InviteActionResult>
  onCancelInvite?: (
    userId: string,
    organizationId: string,
  ) => Promise<InviteActionResult>
}

export function OrganizationSettingsModal({ 
  organization, 
  projects,
  allProjects,
  users,
  currentUserId,
  currentUserRole,
  canManageApiKeys = false,
  initialActiveTab = "details",
  onClose, 
  onSave,
  onProjectAssociation,
  onUserInvite,
  onUserAdd,
  onUserRemove,
  onUserRoleChange,
  onResendInvite,
  onCancelInvite
}: OrganizationSettingsModalProps) {
  const [name, setName] = useState(organization.name)
  const [description, setDescription] = useState(organization.description || '')
  const [color, setColor] = useState(organization.color)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [associatedProjectIds, setAssociatedProjectIds] = useState<string[]>(
    projects.map(p => p.id)
  )
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<
    'details' | 'projects' | 'users' | 'api-keys'
  >(initialActiveTab)
  const [showInviteUser, setShowInviteUser] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteStatus, setInviteStatus] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)
  const [isInvitingUser, setIsInvitingUser] = useState(false)
  const [localInvitedUsers, setLocalInvitedUsers] = useState<User[]>([])
  const [showAddUser, setShowAddUser] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [resendingInvites, setResendingInvites] = useState<Set<string>>(new Set())
  const [cancellingInvites, setCancellingInvites] = useState<Set<string>>(new Set())
  const [apiKeys, setApiKeys] = useState<ApiKeyMeta[]>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [apiKeyName, setApiKeyName] = useState("")
  const [apiKeyExpiresAt, setApiKeyExpiresAt] = useState("")
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>(["read"])
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [apiKeySecret, setApiKeySecret] = useState<string | null>(null)
  const [apiKeyCreatedName, setApiKeyCreatedName] = useState("")
  const [apiKeyCopied, setApiKeyCopied] = useState(false)
  
  // Get organization members (including owner)
  const [organizationUserIds, setOrganizationUserIds] = useState<string[]>(() =>
    getOrganizationUserIds(organization),
  )
  
  // Check if current user is the owner
  const isOwner = currentUserId === organization.ownerId
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'super_admin'
  const canManageUsers = isOwner || isAdmin
  const canManageApiSettings = canManageApiKeys || isOwner

  useEffect(() => {
    if (initialActiveTab) {
      setActiveTab(initialActiveTab)
    }
  }, [initialActiveTab])

  useEffect(() => {
    setName(organization.name)
    setDescription(organization.description || '')
    setColor(organization.color)
    setAssociatedProjectIds(projects.map((project) => project.id))
    setOrganizationUserIds(getOrganizationUserIds(organization))
    setLocalInvitedUsers([])
    setShowInviteUser(false)
    setInviteEmail('')
    setInviteFirstName('')
    setInviteLastName('')
    setInviteError(null)
    setInviteStatus(null)
    setIsInvitingUser(false)
    setShowAddUser(false)
    setUserSearchQuery('')
  }, [organization.id])

  const loadApiKeys = useCallback(async () => {
    if (!canManageApiSettings) {
      return
    }

    setApiKeysLoading(true)
    setApiKeyError(null)
    try {
      const response = await fetch(`/api/organizations/${organization.id}/api-keys`, {
        credentials: "include",
      })
      const payload = await response.json()
      if (response.ok) {
        setApiKeys(payload.keys || [])
      } else {
        setApiKeyError(payload.error || "Failed to load API keys.")
      }
    } catch (error) {
      setApiKeyError("Failed to load API keys.")
    } finally {
      setApiKeysLoading(false)
    }
  }, [canManageApiSettings, organization.id])

  const createOrganizationApiKey = async () => {
    if (!canManageApiSettings) {
      return
    }

    if (!apiKeyName.trim()) {
      setApiKeyError("Name is required.")
      return
    }

    const expiresMs = Date.parse(apiKeyExpiresAt)
    if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
      setApiKeyError("Expiration must be a valid future datetime.")
      return
    }

    try {
      const response = await fetch(`/api/organizations/${organization.id}/api-keys`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: apiKeyName.trim(),
          scopes: apiKeyScopes,
          expiresAt: new Date(expiresMs).toISOString(),
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setApiKeyError(payload.error || "Failed to create organization key.")
        return
      }

      setApiKeys((prev) => [payload.key, ...prev])
      setApiKeyName("")
      setApiKeyExpiresAt("")
      setApiKeyScopes(["read"])
      setApiKeySecret(payload.key?.secret || null)
      setApiKeyCreatedName(payload.key?.name || "")
      setApiKeyCopied(false)
      loadApiKeys()
    } catch (error) {
      setApiKeyError("Failed to create organization key.")
    }
  }

  const revokeOrganizationApiKey = async (id: string) => {
    if (!canManageApiSettings) {
      return
    }
    try {
      const response = await fetch(`/api/organizations/${organization.id}/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!response.ok) {
        const payload = await response.json()
        setApiKeyError(payload.error || "Failed to revoke key.")
        return
      }
      setApiKeys((prev) =>
        prev.map((key) => (key.id === id ? { ...key, isActive: false } : key)),
      )
    } catch (error) {
      setApiKeyError("Failed to revoke key.")
    }
  }

  const toggleOrgApiScope = (scope: string, checked: boolean) => {
    if (scope === "read") return
    setApiKeyScopes((prev) => {
      const next = new Set(prev.includes("read") ? prev : [...prev, "read"])
      if (checked) {
        next.add(scope)
      } else {
        next.delete(scope)
      }
      return Array.from(next)
    })
  }

  const copyOrgApiKeySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret)
      setApiKeyCopied(true)
      setTimeout(() => setApiKeyCopied(false), 2000)
    } catch (error) {
      // best effort copy
    }
  }

  useEffect(() => {
    if (activeTab === "api-keys") {
      loadApiKeys()
    }
  }, [activeTab, loadApiKeys])

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const filteredProjects = allProjects.filter(project => 
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    richTextToPlainText(project.description).toLowerCase().includes(searchQuery.toLowerCase())
  )
  const sortedFilteredProjects = [...filteredProjects].sort((left, right) => {
    const leftAssociated = associatedProjectIds.includes(left.id)
    const rightAssociated = associatedProjectIds.includes(right.id)

    if (leftAssociated === rightAssociated) {
      return left.name.localeCompare(right.name)
    }

    return leftAssociated ? -1 : 1
  })

  const handleProjectToggle = (projectId: string) => {
    setAssociatedProjectIds(prev => 
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }

  const displayedUsers = mergeUsersById(users, localInvitedUsers)
  const pendingUsers = displayedUsers.filter(
    (user) => organizationUserIds.includes(user.id) && user.status === 'pending',
  )
  const activeUsers = displayedUsers.filter(
    (user) => organizationUserIds.includes(user.id) && user.status !== 'pending',
  )
  const availableUsers = filterAvailableMembers(
    displayedUsers,
    displayedUsers.map((user) => user.id),
    organizationUserIds,
    userSearchQuery,
  )

  const formatInviteFeedback = (
    fallback: string,
    result?: InviteActionResult | null,
  ) => {
    const provider = result?.emailDelivery?.provider
    const messageId = result?.emailDelivery?.messageId
    if (provider && messageId) {
      return `${fallback} ${provider} message id: ${messageId}.`
    }
    if (provider) {
      return `${fallback} Sent via ${provider}.`
    }
    return result?.message || fallback
  }

  const handleInviteUser = async () => {
    if (!inviteEmail || !inviteFirstName || !inviteLastName || !onUserInvite) {
      return
    }

    setIsInvitingUser(true)
    setInviteError(null)
    setInviteStatus(null)

    try {
      const result = await onUserInvite(
        inviteEmail.trim(),
        organization.id,
        inviteFirstName.trim(),
        inviteLastName.trim(),
      )

      const inviteResult: OrganizationInviteResult = {
        userId: result?.userId,
        email: inviteEmail.trim(),
        firstName: inviteFirstName.trim(),
        lastName: inviteLastName.trim(),
      }
      const pendingUser = buildPendingOrganizationUser(inviteResult)

      setOrganizationUserIds((current) =>
        current.includes(pendingUser.id) ? current : [...current, pendingUser.id],
      )
      setLocalInvitedUsers((current) => mergeUsersById(current, [pendingUser]))
      setInviteStatus({
        tone: 'success',
        message: formatInviteFeedback(
          `Invite sent to ${pendingUser.email}.`,
          { emailDelivery: result?.emailDelivery || null },
        ),
      })
      setShowInviteUser(false)
      setInviteEmail('')
      setInviteFirstName('')
      setInviteLastName('')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send invite.'
      setInviteError(message)
      setInviteStatus({
        tone: 'error',
        message,
      })
    } finally {
      setIsInvitingUser(false)
    }
  }

  const handleResendInvite = async (user: User) => {
    if (!onResendInvite) {
      return
    }

    setResendingInvites((current) => new Set(current).add(user.id))
    try {
      const result = await onResendInvite(user.id, organization.id)
      setInviteStatus({
        tone: 'success',
        message: formatInviteFeedback(
          `Invite resent to ${user.email}.`,
          result,
        ),
      })
    } catch (error) {
      setInviteStatus({
        tone: 'error',
        message:
          error instanceof Error ? error.message : `Failed to resend invite to ${user.email}.`,
      })
    } finally {
      setResendingInvites((current) => {
        const next = new Set(current)
        next.delete(user.id)
        return next
      })
    }
  }

  const handleCancelInvite = async (user: User) => {
    if (!onCancelInvite) {
      return
    }

    setCancellingInvites((current) => new Set(current).add(user.id))
    try {
      const result = await onCancelInvite(user.id, organization.id)
      setOrganizationUserIds((current) => current.filter((id) => id !== user.id))
      setLocalInvitedUsers((current) => current.filter((candidate) => candidate.id !== user.id))
      setInviteStatus({
        tone: 'success',
        message: result?.message || `Cancelled invitation for ${user.email}.`,
      })
    } catch (error) {
      setInviteStatus({
        tone: 'error',
        message:
          error instanceof Error ? error.message : `Failed to cancel invite for ${user.email}.`,
      })
    } finally {
      setCancellingInvites((current) => {
        const next = new Set(current)
        next.delete(user.id)
        return next
      })
    }
  }

  const handleSave = () => {
    // Save organization details
    onSave({
      name,
      description,
      color,
      memberIds: organizationUserIds
    })

    // Update project associations
    allProjects.forEach(project => {
      const shouldBeAssociated = associatedProjectIds.includes(project.id)
      const isCurrentlyAssociated =
        ((project as any).organization_id || project.organizationId) ===
        organization.id

      if (shouldBeAssociated !== isCurrentlyAssociated) {
        // Update the project's organization
        // For now, we'll just update to this organization if selected
        // In the future, this could support multiple organizations
        if (shouldBeAssociated) {
          onProjectAssociation(project.id, [organization.id])
        }
      }
    })

    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Organization Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'details' 
                ? 'text-white' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Details
            {activeTab === 'details' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-theme-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'projects' 
                ? 'text-white' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Projects
            {activeTab === 'projects' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-theme-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'users' 
                ? 'text-white' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Users
            {organizationUserIds.length > 0 && (
              <span className="text-xs text-zinc-400">
                ({organizationUserIds.length})
              </span>
            )}
            {activeTab === 'users' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-theme-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'api-keys'
                ? 'text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            API Keys
            {activeTab === 'api-keys' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-theme-primary" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Organization name"
                disabled={!isOwner}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Organization description"
                disabled={!isOwner}
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="relative" ref={colorPickerRef}>
                <button
                  onClick={() => isOwner && setShowColorPicker(!showColorPicker)}
                  className={`w-12 h-12 rounded-lg border-2 border-zinc-700 transition-transform ${isOwner ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                  style={{ backgroundColor: color }}
                  disabled={!isOwner}
                />
                {showColorPicker && (
                  <div className="absolute mt-2 z-50">
                    <ColorPicker
                      currentColor={color}
                      onColorChange={(newColor) => {
                        setColor(newColor)
                        setShowColorPicker(false)
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Projects Tab */}
          {activeTab === 'projects' && (
            <div>
              <h3 className="text-lg font-medium mb-4">Associated Projects</h3>
            
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-10 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
              />
            </div>

            {/* Project List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {sortedFilteredProjects.map(project => {
                const isAssociated = associatedProjectIds.includes(project.id)
                return (
                  <label
                    key={project.id}
                    className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isAssociated}
                      onChange={() => handleProjectToggle(project.id)}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 focus:ring-offset-zinc-900"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: project.color }} 
                      />
                      <span className="text-sm">{project.name}</span>
                      {project.description && (
                        <span className="text-xs text-zinc-500">
                          - {getRichTextPreview(project.description, 90)}
                        </span>
                      )}
                    </div>
                    {isAssociated && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                  </label>
                )
              })}
            </div>

            <p className="text-xs text-zinc-500 mt-2">
              Projects can be associated with multiple organizations
            </p>
          </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Organization Members</h3>
                {canManageUsers && (
                  <div className="flex gap-2">
                    <div className="group relative">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setShowInviteUser(true)
                          setShowAddUser(false)
                        }}
                        aria-label="Invite member"
                        className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                        Invite member
                        <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                      </span>
                    </div>
                    <div className="group relative">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setShowAddUser(true)
                          setShowInviteUser(false)
                        }}
                        aria-label="Add existing member"
                        className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                      >
                        <Link2 className="w-4 h-4" />
                      </Button>
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                        Add existing member
                        <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {inviteStatus && (
                <div
                  className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                    inviteStatus.tone === 'success'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/40 bg-red-500/10 text-red-300'
                  }`}
                >
                  {inviteStatus.message}
                </div>
              )}

              {/* Members List */}
              <div className="space-y-2">
                {organizationUserIds.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No members yet</p>
                    <p className="text-xs mt-1">Invite or add users to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingUsers.length > 0 && (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-white">
                            Pending Invitations
                          </h4>
                          <span className="text-xs text-zinc-500">
                            {pendingUsers.length} pending
                          </span>
                        </div>
                        <div className="space-y-2">
                          {pendingUsers.map((user) => (
                            <div
                              key={user.id}
                              className="flex items-center justify-between rounded-lg bg-zinc-800 p-3"
                            >
                              <div className="flex items-center gap-3">
                                <UserAvatar
                                  name={user.name || `${user.firstName} ${user.lastName}`}
                                  profileColor={user.profileColor}
                                  memoji={user.profileMemoji}
                                  size={32}
                                  className="text-sm font-medium"
                                />
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">
                                    {user.name || `${user.firstName} ${user.lastName}`}
                                  </p>
                                  <p className="text-xs text-zinc-500">{user.email}</p>
                                  <span className="inline-flex rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                                    Pending Acceptance
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {onResendInvite && canManageUsers && (
                                  <div className="group relative">
                                    <button
                                      onClick={() => handleResendInvite(user)}
                                      disabled={resendingInvites.has(user.id)}
                                      aria-label="Resend invitation"
                                      className="flex h-9 w-9 items-center justify-center rounded-md bg-theme-gradient text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      {resendingInvites.has(user.id) ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <RotateCcw className="h-4 w-4" />
                                      )}
                                    </button>
                                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                                      {resendingInvites.has(user.id) ? 'Resending' : 'Retry invite'}
                                      <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                                    </span>
                                  </div>
                                )}
                                {onCancelInvite && canManageUsers && (
                                  <div className="group relative">
                                    <button
                                      onClick={() => handleCancelInvite(user)}
                                      disabled={cancellingInvites.has(user.id)}
                                      aria-label="Delete invitation"
                                      className="flex h-9 w-9 items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      {cancellingInvites.has(user.id) ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </button>
                                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                                      {cancellingInvites.has(user.id) ? 'Deleting' : 'Delete invite'}
                                      <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeUsers
                      .map(user => (
                        <div 
                          key={user.id}
                          className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              name={user.name || `${user.firstName} ${user.lastName}`}
                              profileColor={user.profileColor}
                              memoji={user.profileMemoji}
                              size={32}
                              className="text-sm font-medium"
                            />
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                {user.name || `${user.firstName} ${user.lastName}`}
                                {organization.ownerId === user.id && (
                                  <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                                    Owner
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-zinc-500">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {onUserRoleChange && canManageUsers && (
                              <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1">
                                {(['team_member', 'admin', 'super_admin'] as const).map((roleOption) => {
                                  const isActive = (user.role || 'team_member') === roleOption
                                  const label =
                                    roleOption === 'team_member'
                                      ? 'Team'
                                      : roleOption === 'super_admin'
                                        ? 'Super'
                                        : 'Admin'

                                  return (
                                    <button
                                      key={roleOption}
                                      onClick={() => onUserRoleChange(user.id, organization.id, roleOption)}
                                      disabled={user.id === currentUserId}
                                      className={`rounded px-2 py-1 text-[11px] transition-colors ${
                                        isActive
                                          ? 'bg-theme-primary text-white'
                                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                      } disabled:cursor-not-allowed disabled:opacity-50`}
                                      title={`Set role to ${roleOption.replace('_', ' ')}`}
                                    >
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                            {onUserRemove && canManageUsers && organization.ownerId !== user.id && (
                              <button
                                onClick={() => onUserRemove(user.id, organization.id)}
                                className="p-1.5 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-red-400"
                                title="Remove from organization"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Invite User Modal */}
              {showInviteUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                  <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full">
                    <h3 className="text-lg font-semibold mb-4">Invite New User</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">First Name</label>
                          <input
                            type="text"
                            value={inviteFirstName}
                            onChange={(e) => setInviteFirstName(e.target.value)}
                            placeholder="John"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Last Name</label>
                          <input
                            type="text"
                            value={inviteLastName}
                            onChange={(e) => setInviteLastName(e.target.value)}
                            placeholder="Doe"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Email Address</label>
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="user@example.com"
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                        />
                      </div>
                      {inviteError && (
                        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                          {inviteError}
                        </div>
                      )}
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => {
                            setInviteError(null)
                            setShowInviteUser(false)
                            setInviteEmail('')
                            setInviteFirstName('')
                            setInviteLastName('')
                          }}
                          className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleInviteUser}
                          disabled={
                            isInvitingUser ||
                            !inviteEmail ||
                            !inviteFirstName ||
                            !inviteLastName
                          }
                          className="px-4 py-2 bg-theme-gradient text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isInvitingUser ? 'Sending…' : 'Send Invite'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Add Existing User Modal */}
              {showAddUser && (
                <ExistingMemberPicker
                  searchId="organization-user-search"
                  searchLabel="Search Organization Users"
                  searchQuery={userSearchQuery}
                  onSearchQueryChange={setUserSearchQuery}
                  users={availableUsers}
                  emptyMessage="No eligible organization users found."
                  onSelect={async (user) => {
                    await onUserAdd?.(user.id, organization.id)
                    setOrganizationUserIds((current) =>
                      current.includes(user.id) ? current : [...current, user.id],
                    )
                    setShowAddUser(false)
                    setUserSearchQuery('')
                  }}
                />
              )}
            </div>
          )}

          {/* API Keys Tab */}
          {activeTab === 'api-keys' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-4">Organization API Keys</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Create organization scoped keys for integrations and service automation.
                </p>

                {apiKeyError && (
                  <p className="mb-3 text-sm text-red-300">{apiKeyError}</p>
                )}

                <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/50 p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Key Name</label>
                    <input
                      type="text"
                      value={apiKeyName}
                      onChange={(e) => setApiKeyName(e.target.value)}
                      placeholder="CI service"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                    <div>
                      <label className="block text-sm font-medium mb-2">Expires (required)</label>
                      <input
                        type="datetime-local"
                        value={apiKeyExpiresAt}
                        onChange={(e) => setApiKeyExpiresAt(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={createOrganizationApiKey}
                      className="px-4 py-2 h-10 rounded-lg bg-theme-gradient text-white hover:opacity-90"
                      disabled={!canManageApiSettings}
                    >
                      Create Key
                    </button>
                  </div>

                  <div>
                    <p className="text-sm text-zinc-300 mb-2">Scopes</p>
                    <div className="flex flex-wrap gap-4">
                      {ALLOWED_API_SCOPES.map((scope) => (
                        <label key={scope} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={
                              scope === "read"
                                ? apiKeyScopes.includes("read")
                                : apiKeyScopes.includes(scope)
                            }
                            onChange={(e) =>
                              toggleOrgApiScope(scope, e.target.checked)
                            }
                            disabled={scope === "read"}
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 focus:ring-offset-zinc-900"
                          />
                          <span className="text-zinc-300">
                            {scope} {scope === "read" ? "(required)" : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {!canManageApiSettings && (
                    <p className="text-xs text-zinc-400">
                      You must be the organization owner or an admin to create or revoke org API
                      keys.
                    </p>
                  )}
                </div>

                {apiKeySecret && (
                  <div className="mt-4 rounded-lg border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p>
                        New key created for <strong>{apiKeyCreatedName}</strong>. Copy now; it is not
                        shown again.
                      </p>
                      <button
                        type="button"
                        onClick={() => copyOrgApiKeySecret(apiKeySecret)}
                        className="px-2 py-1 text-xs border border-emerald-700 rounded hover:bg-emerald-800/40"
                      >
                        {apiKeyCopied ? "Copied" : "Copy key"}
                      </button>
                    </div>
                    <p className="mt-2 break-all font-mono text-xs">{apiKeySecret}</p>
                  </div>
                )}
              </div>

              {apiKeysLoading && (
                <p className="text-sm text-zinc-500">Loading organization keys...</p>
              )}

              <div className="space-y-2">
                {apiKeys.length === 0 && !apiKeysLoading ? (
                  <p className="text-sm text-zinc-500">No organization API keys yet.</p>
                ) : (
                  apiKeys.map((key) => (
                    <div
                      key={key.id}
                      className="rounded-lg border border-zinc-800 p-3 bg-zinc-950/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {key.name}
                            {!key.isActive && (
                              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                Revoked
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-zinc-400 mt-1">
                            {key.scopes.join(", ")} · Expires: {key.expiresAt || "No expiry"}
                          </p>
                          <p className="text-xs text-zinc-500 mt-1">
                            Created: {key.createdAt} · Last used: {key.lastUsedAt || "Never"}
                          </p>
                          <p className="text-xs font-mono text-zinc-500 mt-1">{key.maskedKey}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => revokeOrganizationApiKey(key.id)}
                          disabled={!key.isActive}
                          className={`px-3 py-1.5 rounded text-xs ${
                            key.isActive
                              ? "bg-red-600 hover:bg-red-500 text-white"
                              : "bg-zinc-700 text-zinc-300"
                          }`}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          {canManageUsers || isOwner ? (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-theme-gradient text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Save Changes
            </button>
          ) : (
            <span className="text-sm text-zinc-500">Only the owner or an admin can make changes</span>
          )}
        </div>
      </div>
    </div>
  )
}

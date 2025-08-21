"use client"

import { useState, useEffect, useRef } from 'react'
import { X, Search, Building2, Plus, Check, Users, Mail, UserPlus, Trash2, Loader2 } from 'lucide-react'
import { Organization, Project, Database, User } from '@/lib/types'
import { ColorPicker } from './color-picker'
import { getBackgroundStyle } from '@/lib/style-utils'

interface OrganizationSettingsModalProps {
  organization: Organization
  projects: Project[]
  allProjects: Project[]
  users: User[]
  currentUserId?: string
  onClose: () => void
  onSave: (updates: Partial<Organization>) => void
  onProjectAssociation: (projectId: string, organizationIds: string[]) => void
  onUserInvite?: (email: string, organizationId: string, firstName: string, lastName: string) => void
  onUserAdd?: (userId: string, organizationId: string) => void
  onUserRemove?: (userId: string, organizationId: string) => void
  onSendReminder?: (userId: string, organizationId: string) => void
}

export function OrganizationSettingsModal({ 
  organization, 
  projects, 
  allProjects,
  users,
  currentUserId,
  onClose, 
  onSave,
  onProjectAssociation,
  onUserInvite,
  onUserAdd,
  onUserRemove,
  onSendReminder
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
  const [activeTab, setActiveTab] = useState<'details' | 'projects' | 'users'>('details')
  const [showInviteUser, setShowInviteUser] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [sendingReminders, setSendingReminders] = useState<Set<string>>(new Set())
  
  // Get organization members (including owner)
  const [organizationUserIds, setOrganizationUserIds] = useState<string[]>(() => {
    const ids = new Set(organization.memberIds || [])
    // Always include the owner
    if (organization.ownerId) {
      ids.add(organization.ownerId)
    }
    return Array.from(ids)
  })
  
  // Check if current user is the owner
  const isOwner = currentUserId === organization.ownerId

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
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleProjectToggle = (projectId: string) => {
    setAssociatedProjectIds(prev => 
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
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
      const isCurrentlyAssociated = project.organizationId === organization.id

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
              {filteredProjects.map(project => {
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
                        <span className="text-xs text-zinc-500">- {project.description}</span>
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
                {isOwner && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowInviteUser(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm"
                    >
                      <Mail className="w-4 h-4" />
                      Invite User
                    </button>
                    <button
                      onClick={() => setShowAddUser(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-theme-gradient hover:opacity-90 rounded-lg transition-opacity text-sm text-white"
                    >
                      <UserPlus className="w-4 h-4" />
                      Add Existing User
                    </button>
                  </div>
                )}
              </div>

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
                    {users
                      .filter(user => organizationUserIds.includes(user.id))
                      .map(user => (
                        <div 
                          key={user.id}
                          className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                              style={getBackgroundStyle(user.profileColor)}
                            >
                              {(user.name || `${user.firstName} ${user.lastName}`).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                {user.name || `${user.firstName} ${user.lastName}`}
                                {organization.ownerId === user.id && (
                                  <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                                    Owner
                                  </span>
                                )}
                                {user.status === 'pending' && (
                                  <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded-full">
                                    Pending Acceptance
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-zinc-500">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {user.status === 'pending' && onSendReminder && isOwner && (
                              <button
                                onClick={async () => {
                                  setSendingReminders(prev => new Set(prev).add(user.id))
                                  try {
                                    const result = await onSendReminder(user.id, organization.id)
                                    // Only clear loading state when delivery is confirmed
                                    if (result?.delivered) {
                                      setSendingReminders(prev => {
                                        const newSet = new Set(prev)
                                        newSet.delete(user.id)
                                        return newSet
                                      })
                                    }
                                  } catch (error) {
                                    // Clear loading state on error
                                    setSendingReminders(prev => {
                                      const newSet = new Set(prev)
                                      newSet.delete(user.id)
                                      return newSet
                                    })
                                  }
                                }}
                                disabled={sendingReminders.has(user.id)}
                                className="px-3 py-1 text-xs bg-theme-gradient text-white rounded hover:opacity-90 transition-opacity disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1.5"
                                title={sendingReminders.has(user.id) ? "Sending reminder..." : "Send reminder email"}
                              >
                                Send Reminder
                                {sendingReminders.has(user.id) && (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                              </button>
                            )}
                            {onUserRemove && isOwner && organization.ownerId !== user.id && (
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
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => {
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
                          onClick={() => {
                            if (inviteEmail && inviteFirstName && inviteLastName && onUserInvite) {
                              onUserInvite(inviteEmail, organization.id, inviteFirstName, inviteLastName)
                              setShowInviteUser(false)
                              setInviteEmail('')
                              setInviteFirstName('')
                              setInviteLastName('')
                            }
                          }}
                          disabled={!inviteEmail || !inviteFirstName || !inviteLastName}
                          className="px-4 py-2 bg-theme-gradient text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Send Invite
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Add Existing User Modal */}
              {showAddUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                  <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full">
                    <h3 className="text-lg font-semibold mb-4">Add Existing User</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Search Users</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
                          <input
                            type="text"
                            value={userSearchQuery}
                            onChange={(e) => setUserSearchQuery(e.target.value)}
                            placeholder="Search by name or email..."
                            className="w-full pl-10 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none"
                          />
                        </div>
                      </div>
                      
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {users
                          .filter(user => {
                            const userName = user.name || `${user.firstName} ${user.lastName}`
                            return !organizationUserIds.includes(user.id) &&
                              (userName.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                               user.email.toLowerCase().includes(userSearchQuery.toLowerCase()))
                          })
                          .map(user => {
                            const userName = user.name || `${user.firstName} ${user.lastName}`
                            return (
                              <button
                                key={user.id}
                                onClick={() => {
                                  if (onUserAdd) {
                                    onUserAdd(user.id, organization.id)
                                    setOrganizationUserIds([...organizationUserIds, user.id])
                                    setShowAddUser(false)
                                    setUserSearchQuery('')
                                  }
                                }}
                                className="w-full flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-left"
                              >
                                <div 
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                                  style={getBackgroundStyle(user.profileColor)}
                                >
                                  {userName.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{userName}</p>
                                  <p className="text-xs text-zinc-500">{user.email}</p>
                                </div>
                                <Plus className="w-4 h-4 text-zinc-400" />
                              </button>
                            )
                          })}
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            setShowAddUser(false)
                            setUserSearchQuery('')
                          }}
                          className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
          {isOwner ? (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-theme-gradient text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Save Changes
            </button>
          ) : (
            <span className="text-sm text-zinc-500">Only the owner can make changes</span>
          )}
        </div>
      </div>
    </div>
  )
}
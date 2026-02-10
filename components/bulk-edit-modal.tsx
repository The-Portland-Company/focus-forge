"use client"

import { useState, useRef, useEffect } from 'react'
import { X, Calendar, Flag, User, Folder, Repeat, Trash2, Plus, Mail, Loader2, Check } from 'lucide-react'
import { Task, Project, Database } from '@/lib/types'

interface BulkEditModalProps {
  isOpen: boolean
  onClose: () => void
  selectedTaskIds: Set<string>
  database: Database
  onApply: (updates: Partial<Task>) => void
  onDelete: () => void
  onInviteUser?: (email: string, firstName: string, lastName: string) => Promise<{ userId: string } | null>
}

export function BulkEditModal({ isOpen, onClose, selectedTaskIds, database, onApply, onDelete, onInviteUser }: BulkEditModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [assignedToName, setAssignedToName] = useState<string>('')
  const [projectId, setProjectId] = useState<string>('')
  const [dueDate, setDueDate] = useState<string>('')
  const [dueTime, setDueTime] = useState<string>('')
  const [priority, setPriority] = useState<string>('')
  const [recurringPattern, setRecurringPattern] = useState<string>('')

  // User search state
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  // Project dropdown state
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [projectFilterQuery, setProjectFilterQuery] = useState('')

  // Priority dropdown state
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false)
  const [priorityFilterQuery, setPriorityFilterQuery] = useState('')

  const userSearchRef = useRef<HTMLDivElement>(null)
  const projectDropdownRef = useRef<HTMLDivElement>(null)
  const priorityDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userSearchRef.current && !userSearchRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false)
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false)
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target as Node)) {
        setShowPriorityDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!isOpen) return null

  // Filter users based on search query
  const filteredUsers = database.users.filter(user => {
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase()
    const email = user.email?.toLowerCase() || ''
    const query = userSearchQuery.toLowerCase()
    return fullName.includes(query) || email.includes(query)
  })

  const handleSelectUser = (userId: string, userName: string) => {
    setAssignedTo(userId)
    setAssignedToName(userName)
    setUserSearchQuery(userName)
    setShowUserDropdown(false)
  }

  const handleClearUser = () => {
    setAssignedTo('')
    setAssignedToName('')
    setUserSearchQuery('')
  }

  const handleInviteUser = async () => {
    if (!inviteEmail || !inviteFirstName || !inviteLastName) {
      setInviteError('Please fill in all fields')
      return
    }

    // Basic email validation
    if (!inviteEmail.includes('@') || !inviteEmail.includes('.')) {
      setInviteError('Please enter a valid email address')
      return
    }

    setIsInviting(true)
    setInviteError('')

    try {
      if (onInviteUser) {
        const result = await onInviteUser(inviteEmail, inviteFirstName, inviteLastName)
        if (result?.userId) {
          // Select the newly invited user
          const fullName = `${inviteFirstName} ${inviteLastName}`
          handleSelectUser(result.userId, fullName)
          setShowInviteForm(false)
          setInviteEmail('')
          setInviteFirstName('')
          setInviteLastName('')
        }
      }
    } catch (error) {
      console.error('Error inviting user:', error)
      setInviteError('Failed to invite user. Please try again.')
    } finally {
      setIsInviting(false)
    }
  }

  const handleApply = () => {
    const updates: Record<string, any> = {}

    // Only include fields that have values
    if (assignedTo) {
      updates.assigned_to = assignedTo
    }
    if (projectId) {
      updates.project_id = projectId
    }
    if (dueDate) {
      updates.due_date = dueDate
      if (dueTime) {
        updates.due_time = dueTime
      }
    }
    if (priority) {
      updates.priority = parseInt(priority) as 1 | 2 | 3 | 4
    }
    if (recurringPattern) {
      updates.recurringPattern = recurringPattern
    }

    // Only apply if there are updates
    if (Object.keys(updates).length > 0) {
      onApply(updates)
      onClose()
    }
  }

  const hasChanges = assignedTo || projectId || dueDate || priority || recurringPattern

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-md mx-4 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">
            Bulk Edit {selectedTaskIds.size} Task{selectedTaskIds.size > 1 ? 's' : ''}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Assigned To */}
          <div ref={userSearchRef}>
            <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <User className="w-4 h-4" />
              Assigned To
            </label>

            {!showInviteForm ? (
              <div className="relative">
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value)
                    setShowUserDropdown(true)
                    if (!e.target.value) {
                      handleClearUser()
                    }
                  }}
                  onFocus={() => setShowUserDropdown(true)}
                  placeholder="Search users..."
                  className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme"
                />
                {userSearchQuery && (
                  <button
                    onClick={handleClearUser}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* User dropdown */}
                {showUserDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {/* Unassigned option */}
                    <button
                      onClick={() => {
                        handleClearUser()
                        setShowUserDropdown(false)
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                      Unassigned
                    </button>

                    {filteredUsers.length > 0 ? (
                      filteredUsers.map(user => (
                        <button
                          key={user.id}
                          onClick={() => handleSelectUser(user.id, `${user.firstName} ${user.lastName}`)}
                          className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between ${
                            assignedTo === user.id
                              ? 'bg-[rgb(var(--theme-primary-rgb))]/20 text-white'
                              : 'text-white hover:bg-zinc-700'
                          }`}
                        >
                          <span>{user.firstName} {user.lastName}</span>
                          <div className="flex items-center gap-2">
                            {user.email && (
                              <span className="text-xs text-zinc-500">{user.email}</span>
                            )}
                            {assignedTo === user.id && (
                              <Check className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))]" />
                            )}
                          </div>
                        </button>
                      ))
                    ) : userSearchQuery ? (
                      <div className="px-3 py-2 text-sm text-zinc-500">
                        No users found
                      </div>
                    ) : null}

                    {/* Add new user button */}
                    {onInviteUser && (
                      <button
                        onClick={() => {
                          setShowInviteForm(true)
                          setShowUserDropdown(false)
                          // Pre-fill email if search looks like an email
                          if (userSearchQuery.includes('@')) {
                            setInviteEmail(userSearchQuery)
                          }
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-[rgb(var(--theme-primary-rgb))] hover:bg-zinc-700 transition-colors flex items-center gap-2 border-t border-zinc-700"
                      >
                        <Plus className="w-4 h-4" />
                        Invite new user
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Invite form - contained within the modal */
              <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Invite New User
                  </span>
                  <button
                    onClick={() => {
                      setShowInviteForm(false)
                      setInviteEmail('')
                      setInviteFirstName('')
                      setInviteLastName('')
                      setInviteError('')
                    }}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="First"
                    className="w-full min-w-0 bg-zinc-800 text-white text-sm px-2 py-2 rounded border border-zinc-700 focus:outline-none focus:ring-2 ring-theme"
                  />
                  <input
                    type="text"
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    placeholder="Last"
                    className="w-full min-w-0 bg-zinc-800 text-white text-sm px-2 py-2 rounded border border-zinc-700 focus:outline-none focus:ring-2 ring-theme"
                  />
                </div>

                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full bg-zinc-800 text-white text-sm px-3 py-2 rounded border border-zinc-700 focus:outline-none focus:ring-2 ring-theme"
                />

                {inviteError && (
                  <p className="text-xs text-red-400">{inviteError}</p>
                )}

                <button
                  onClick={handleInviteUser}
                  disabled={isInviting || !inviteEmail || !inviteFirstName || !inviteLastName}
                  className="w-full px-3 py-2 text-sm bg-[rgb(var(--theme-primary-rgb))] text-white rounded hover:bg-[rgb(var(--theme-primary-rgb))]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isInviting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending invite...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send Invite & Assign
                    </>
                  )}
                </button>

                <p className="text-xs text-zinc-500">
                  User will be assigned immediately and receive an email invitation to join.
                </p>
              </div>
            )}
          </div>

          {/* Project */}
          <div ref={projectDropdownRef}>
            <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <Folder className="w-4 h-4" />
              Project
            </label>
            <div className="relative">
              {showProjectDropdown ? (
                <input
                  type="text"
                  value={projectFilterQuery}
                  onChange={(e) => setProjectFilterQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowProjectDropdown(true)
                    setProjectFilterQuery('')
                  }}
                  className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme flex items-center justify-between"
                >
                  {projectId ? (() => {
                    const project = database.projects.find(p => p.id === projectId)
                    return project ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span>{project.name}</span>
                      </div>
                    ) : <span className="text-zinc-400">Select a project</span>
                  })() : <span className="text-zinc-400">Select a project</span>}
                  <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {showProjectDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <button
                    onClick={() => {
                      setProjectId('')
                      setShowProjectDropdown(false)
                      setProjectFilterQuery('')
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                  >
                    No Project
                  </button>
                  {database.projects
                    .filter(p => !p.archived && p.name.toLowerCase().includes(projectFilterQuery.toLowerCase()))
                    .map(project => (
                      <button
                        key={project.id}
                        onClick={() => {
                          setProjectId(project.id)
                          setShowProjectDropdown(false)
                          setProjectFilterQuery('')
                        }}
                        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                          projectId === project.id
                            ? 'bg-[rgb(var(--theme-primary-rgb))]/20 text-white'
                            : 'text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="flex-1">{project.name}</span>
                        {projectId === project.id && (
                          <Check className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))]" />
                        )}
                      </button>
                    ))}
                  {projectFilterQuery && database.projects.filter(p =>
                    !p.archived && p.name.toLowerCase().includes(projectFilterQuery.toLowerCase())
                  ).length === 0 && (
                    <div className="px-3 py-2 text-sm text-zinc-500">No projects found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Due Date & Time */}
          <div>
            <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <Calendar className="w-4 h-4" />
              Due Date & Time
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme themed-date-input"
              />
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-28 bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme themed-date-input"
              />
            </div>
          </div>

          {/* Priority */}
          <div ref={priorityDropdownRef}>
            <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <Flag className="w-4 h-4" />
              Priority
            </label>
            <div className="relative">
              {showPriorityDropdown ? (
                <input
                  type="text"
                  value={priorityFilterQuery}
                  onChange={(e) => setPriorityFilterQuery(e.target.value)}
                  placeholder="Search priority..."
                  className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowPriorityDropdown(true)
                    setPriorityFilterQuery('')
                  }}
                  className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme flex items-center justify-between"
                >
                  {priority ? (
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        priority === '1' ? 'bg-red-500' :
                        priority === '2' ? 'bg-orange-500' :
                        priority === '3' ? 'bg-blue-500' :
                        'bg-zinc-500'
                      }`} />
                      <span>Priority {priority} {priority === '1' ? '(Highest)' : priority === '4' ? '(Lowest)' : ''}</span>
                    </div>
                  ) : <span className="text-zinc-400">Select priority</span>}
                  <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {showPriorityDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                  <button
                    onClick={() => {
                      setPriority('')
                      setShowPriorityDropdown(false)
                      setPriorityFilterQuery('')
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                  >
                    No Priority
                  </button>
                  {[
                    { value: '1', label: 'Priority 1 (Highest)', color: 'bg-red-500' },
                    { value: '2', label: 'Priority 2 (High)', color: 'bg-orange-500' },
                    { value: '3', label: 'Priority 3 (Medium)', color: 'bg-blue-500' },
                    { value: '4', label: 'Priority 4 (Lowest)', color: 'bg-zinc-500' },
                  ]
                    .filter(p => p.label.toLowerCase().includes(priorityFilterQuery.toLowerCase()) ||
                                 `p${p.value}`.includes(priorityFilterQuery.toLowerCase()))
                    .map((p) => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setPriority(p.value)
                          setShowPriorityDropdown(false)
                          setPriorityFilterQuery('')
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                          priority === p.value
                            ? 'bg-[rgb(var(--theme-primary-rgb))]/20 text-white'
                            : 'text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${p.color}`} />
                        <span className="flex-1">{p.label}</span>
                        {priority === p.value && (
                          <Check className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))]" />
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Recurring */}
          <div>
            <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <Repeat className="w-4 h-4" />
              Recurring
            </label>
            <input
              type="text"
              value={recurringPattern}
              onChange={(e) => setRecurringPattern(e.target.value)}
              placeholder="e.g., Every Monday, Daily, etc."
              className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme placeholder:text-zinc-600"
            />
          </div>

        </div>

        <div className="flex items-center justify-between p-4 border-t border-zinc-800 flex-shrink-0">
          {/* Delete button on the left */}
          <div className="relative group">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
                <span className="text-sm text-red-400">Delete {selectedTaskIds.size}?</span>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="p-1 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    onDelete()
                    onClose()
                  }}
                  className="p-1 text-red-400 hover:text-red-300 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            )}
            {!showDeleteConfirm && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Delete {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Cancel and Apply buttons on the right */}
          <div className="flex items-center gap-2">
            <div className="relative group">
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Cancel
              </div>
            </div>
            <div className="relative group">
              <button
                onClick={handleApply}
                disabled={!hasChanges}
                className="p-2 bg-[rgb(var(--theme-primary-rgb))] text-white rounded-lg hover:bg-[rgb(var(--theme-primary-rgb))]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-5 h-5" />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Apply Changes
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

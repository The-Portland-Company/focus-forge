"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Organization, Project, User } from "@/lib/types"
import { UserAvatar } from "@/components/user-avatar"
import { Archive, Link2, Loader2, Mail, RotateCcw, Save, Search, Trash2, Users, X } from "lucide-react"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { hasRichTextContent } from "@/lib/rich-text"
import { ExistingMemberPicker, filterAvailableMembers } from "@/components/existing-member-picker"

interface EditProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project | null
  organization: Organization | null
  users: User[]
  currentUserId?: string
  currentUserRole?: User["role"]
  onUpdate: (projectData: Partial<Project>) => void | Promise<void>
  onUserInvite?: (
    email: string,
    projectId: string,
    firstName: string,
    lastName: string,
  ) => Promise<
      | {
          userId?: string
          email: string
          firstName: string
          lastName: string
          emailDelivery?: {
            provider?: string | null
            messageId?: string | null
          } | null
        }
    | null
    | void
  >
  onUserAdd?: (userId: string, projectId: string) => Promise<void> | void
  onUserRemove?: (userId: string, projectId: string) => Promise<void> | void
  onResendInvite?: (
    userId: string,
    projectId: string,
  ) => Promise<{
    message?: string
    emailDelivery?: {
      provider?: string | null
      messageId?: string | null
    } | null
  }>
  onCancelInvite?: (
    userId: string,
    projectId: string,
  ) => Promise<{ message?: string }>
  onArchive?: (projectId: string) => Promise<void> | void
  onDelete?: (projectId: string) => Promise<void> | void
}

export function canManageProjectMembers({
  currentUserId,
  currentUserRole,
  organizationOwnerId,
  projectOwnerId,
  projectUserIds,
}: {
  currentUserId?: string
  currentUserRole?: User["role"]
  organizationOwnerId?: string | null
  projectOwnerId?: string | null
  projectUserIds: string[]
}) {
  return (
    currentUserRole === "admin" ||
    currentUserRole === "super_admin" ||
    currentUserId === organizationOwnerId ||
    currentUserId === projectOwnerId ||
    (!!currentUserId && projectUserIds.includes(currentUserId))
  )
}

export function EditProjectModal({
  isOpen,
  onClose,
  project,
  organization,
  users,
  currentUserId,
  currentUserRole,
  onUpdate,
  onUserInvite,
  onUserAdd,
  onUserRemove,
  onResendInvite,
  onCancelInvite,
  onArchive,
  onDelete,
}: EditProjectModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState("#ef4444")
  const [budget, setBudget] = useState("")
  const [deadline, setDeadline] = useState("")
  const [projectUserIds, setProjectUserIds] = useState<string[]>([])
  const [showInviteUser, setShowInviteUser] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteFirstName, setInviteFirstName] = useState("")
  const [inviteLastName, setInviteLastName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<{
    tone: "success" | "error"
    message: string
    detail?: string
  } | null>(null)
  const [localPendingUsers, setLocalPendingUsers] = useState<User[]>([])
  const [resendingInviteIds, setResendingInviteIds] = useState<Set<string>>(new Set())
  const [cancellingInviteIds, setCancellingInviteIds] = useState<Set<string>>(new Set())
  const [isArchiving, setIsArchiving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!project) return

    setName(project.name)
    setDescription(project.description || "")
    setColor(project.color)
    setBudget(((project as any).budget ?? project.budget)?.toString() || "")
    const projectDeadline = (project as any).deadline || project.deadline
    setDeadline(projectDeadline ? String(projectDeadline).split("T")[0] : "")
    setProjectUserIds(
      Array.from(new Set([...(project.memberIds || []), ...(project.ownerId ? [project.ownerId] : [])])),
    )
    setLocalPendingUsers([])
    setInviteStatus(null)
  }, [project])

  const isManager = canManageProjectMembers({
    currentUserId,
    currentUserRole,
    organizationOwnerId: organization?.ownerId,
    projectOwnerId: project?.ownerId,
    projectUserIds,
  })

  const organizationMemberIds = useMemo(
    () => new Set(organization?.memberIds || users.map((user) => user.id)),
    [organization?.memberIds, users],
  )

  const projectUsers = useMemo(() => {
    const merged = new Map<string, User>()
    for (const user of users) {
      if (projectUserIds.includes(user.id)) {
        merged.set(user.id, user)
      }
    }
    for (const user of localPendingUsers) {
      if (projectUserIds.includes(user.id)) {
        merged.set(user.id, user)
      }
    }
    return Array.from(merged.values())
  }, [localPendingUsers, projectUserIds, users])

  const pendingProjectInvites = useMemo(
    () => projectUsers.filter((user) => user.status === "pending"),
    [projectUsers],
  )

  const projectMembers = useMemo(
    () => projectUsers.filter((user) => user.status !== "pending"),
    [projectUsers],
  )

  const availableUsers = useMemo(() => {
    return filterAvailableMembers(users, organizationMemberIds, projectUserIds, userSearchQuery)
  }, [organizationMemberIds, projectUserIds, userSearchQuery, users])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!project || !name.trim()) return

    setIsSubmitting(true)
    try {
      await onUpdate({
        name: name.trim(),
        description: hasRichTextContent(description) ? description : undefined,
        color,
        budget: budget ? parseFloat(budget) : undefined,
        deadline: deadline || undefined,
      })
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInvite = async () => {
    if (!project || !inviteEmail || !inviteFirstName || !inviteLastName || !onUserInvite) {
      return
    }

    setIsInviting(true)
    try {
      const result = await onUserInvite(
        inviteEmail,
        project.id,
        inviteFirstName,
        inviteLastName,
      )
      const pendingId = result?.userId || `pending:${inviteEmail.toLowerCase()}`
      setProjectUserIds((current) => Array.from(new Set([...current, pendingId])))
      setLocalPendingUsers((current) => [
        ...current.filter((user) => user.id !== pendingId),
        {
          id: pendingId,
          firstName: inviteFirstName,
          lastName: inviteLastName,
          name: `${inviteFirstName} ${inviteLastName}`.trim() || inviteEmail,
          email: inviteEmail,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "pending",
        },
      ])
      const provider = result?.emailDelivery?.provider
      const messageId = result?.emailDelivery?.messageId
      setInviteStatus({
        tone: "success",
        message: "Invitation sent via email.",
        detail: messageId ? `Message ID: ${messageId}` : undefined,
      })
      setShowInviteUser(false)
      setInviteEmail("")
      setInviteFirstName("")
      setInviteLastName("")
    } catch (error) {
      setInviteStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to send invite.",
      })
    } finally {
      setIsInviting(false)
    }
  }

  const handleResendInvite = async (user: User) => {
    if (!onResendInvite || !project) return

    setResendingInviteIds((current) => new Set(current).add(user.id))
    try {
      const result = await onResendInvite(user.id, project.id)
      const provider = result?.emailDelivery?.provider
      const messageId = result?.emailDelivery?.messageId
      setInviteStatus({
        tone: "success",
        message: "Invitation sent via email.",
        detail: messageId ? `Message ID: ${messageId}` : undefined,
      })
    } catch (error) {
      setInviteStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to resend invite.",
      })
    } finally {
      setResendingInviteIds((current) => {
        const next = new Set(current)
        next.delete(user.id)
        return next
      })
    }
  }

  const handleCancelInvite = async (user: User) => {
    if (!onCancelInvite || !project) return

    setCancellingInviteIds((current) => new Set(current).add(user.id))
    try {
      const result = await onCancelInvite(user.id, project.id)
      setProjectUserIds((current) => current.filter((id) => id !== user.id))
      setLocalPendingUsers((current) => current.filter((candidate) => candidate.id !== user.id))
      setInviteStatus({
        tone: "success",
        message: result?.message || `Cancelled invitation for ${user.email}.`,
      })
    } catch (error) {
      setInviteStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to cancel invite.",
      })
    } finally {
      setCancellingInviteIds((current) => {
        const next = new Set(current)
        next.delete(user.id)
        return next
      })
    }
  }

  const handleArchiveProject = async () => {
    if (!project || !onArchive || isArchiving) return

    const confirmed = window.confirm(
      `Archive "${project.name}"? It will be moved out of active projects.`,
    )
    if (!confirmed) return

    setIsArchiving(true)
    try {
      await onArchive(project.id)
      onClose()
    } finally {
      setIsArchiving(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!project || !onDelete || isDeleting) return

    const firstConfirm = window.confirm(
      `Delete "${project.name}"? This will also delete all tasks in this project.`,
    )
    if (!firstConfirm) return

    const secondConfirm = window.confirm(
      `Final confirmation: permanently delete "${project.name}" and everything inside it?`,
    )
    if (!secondConfirm) return

    setIsDeleting(true)
    try {
      await onDelete(project.id)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  if (!project) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update project details and manage project members.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  className="bg-zinc-800 border-zinc-700"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-description">Description</Label>
                <RichTextEditor
                  id="project-description"
                  value={description}
                  onChange={setDescription}
                  placeholder="Optional description"
                  className="bg-zinc-800 border-zinc-700"
                  minHeightClassName="min-h-[140px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="project-budget">Budget</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                    <Input
                      id="project-budget"
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="bg-zinc-800 border-zinc-700 pl-8"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-deadline">Deadline</Label>
                  <Input
                    id="project-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 themed-date-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-color">Color</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="project-color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-20 h-10 bg-zinc-800 border-zinc-700"
                  />
                  <span className="text-sm text-zinc-400">{color}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Project Members
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    {organization?.name || "Organization"} access is still required.
                  </p>
                </div>
                <span className="text-xs text-zinc-500">
                  {projectUsers.length} members
                </span>
              </div>

              {inviteStatus && (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    inviteStatus.tone === "success"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/40 bg-red-500/10 text-red-300"
                  }`}
                >
                  <p>{inviteStatus.message}</p>
                  {inviteStatus.detail ? (
                    <p className="mt-1 text-xs opacity-80">{inviteStatus.detail}</p>
                  ) : null}
                </div>
              )}

              {isManager && (
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

              {showInviteUser && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-first-name">First Name</Label>
                      <Input
                        id="invite-first-name"
                        value={inviteFirstName}
                        onChange={(e) => setInviteFirstName(e.target.value)}
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-last-name">Last Name</Label>
                      <Input
                        id="invite-last-name"
                        value={inviteLastName}
                        onChange={(e) => setInviteLastName(e.target.value)}
                        className="bg-zinc-800 border-zinc-700"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <div className="group relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowInviteUser(false)}
                        aria-label="Cancel invite"
                        className="text-zinc-400 hover:text-white hover:bg-zinc-800"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                        Cancel invite
                        <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                      </span>
                    </div>
                    <div className="group relative">
                      <Button
                        type="button"
                        size="icon"
                        onClick={handleInvite}
                        disabled={
                          isInviting || !inviteEmail || !inviteFirstName || !inviteLastName
                        }
                        aria-label="Send invite"
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {isInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      </Button>
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                        {isInviting ? "Sending invite" : "Send invite"}
                        <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {showAddUser && (
                <ExistingMemberPicker
                  searchId="project-user-search"
                  searchLabel="Search Organization Users"
                  searchQuery={userSearchQuery}
                  onSearchQueryChange={setUserSearchQuery}
                  users={availableUsers}
                  emptyMessage="No eligible organization users found."
                  onSelect={async (user) => {
                    await onUserAdd?.(user.id, project.id)
                    setProjectUserIds((current) => Array.from(new Set([...current, user.id])))
                    setUserSearchQuery("")
                    setShowAddUser(false)
                  }}
                />
              )}

              {pendingProjectInvites.length > 0 && (
                <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">Pending Invitations</h4>
                    <span className="text-xs text-zinc-500">
                      {pendingProjectInvites.length} pending
                    </span>
                  </div>
                  {pendingProjectInvites.map((user) => {
                    const displayName = user.name || `${user.firstName} ${user.lastName}`.trim()
                    return (
                      <div
                        key={user.id}
                        className="flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={displayName}
                            profileColor={user.profileColor}
                            memoji={user.profileMemoji}
                            size={32}
                            className="text-sm font-medium"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-white">
                              {displayName}
                            </p>
                            <p className="text-xs text-zinc-500">{user.email}</p>
                            <span className="inline-flex rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                              Pending Acceptance
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {onResendInvite && (
                            <div className="group relative">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => handleResendInvite(user)}
                                disabled={resendingInviteIds.has(user.id)}
                                aria-label="Resend invitation"
                                className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                              >
                                {resendingInviteIds.has(user.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-4 h-4" />
                                )}
                              </Button>
                              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                                {resendingInviteIds.has(user.id) ? "Resending" : "Retry invite"}
                                <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                              </span>
                            </div>
                          )}
                          {onCancelInvite && (
                            <div className="group relative">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => handleCancelInvite(user)}
                                disabled={cancellingInviteIds.has(user.id)}
                                aria-label="Delete invitation"
                                className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                              >
                                {cancellingInviteIds.has(user.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                                {cancellingInviteIds.has(user.id) ? "Deleting" : "Delete invite"}
                                <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="space-y-2">
                {projectMembers.map((member) => {
                  const displayName = member.name || `${member.firstName} ${member.lastName}`.trim()
                  const isOwner = project.ownerId === member.id
                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2"
                    >
                      <UserAvatar
                        name={displayName}
                        profileColor={member.profileColor}
                        memoji={member.profileMemoji}
                        size={34}
                        className="text-sm font-medium"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{displayName}</p>
                        <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                      </div>
                      {isOwner && (
                        <span className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
                          Owner
                        </span>
                      )}
                      {isManager && !isOwner && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onUserRemove?.(member.id, project.id)
                            setProjectUserIds((current) =>
                              current.filter((userId) => userId !== member.id),
                            )
                          }}
                          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition-colors"
                          title="Remove from project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
                {projectMembers.length === 0 && (
                  <p className="text-sm text-zinc-500">No project members yet.</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex w-full items-center justify-between sm:justify-between">
            <div className="flex items-center gap-2">
              {onDelete && (
                <div className="group relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleDeleteProject}
                    disabled={isDeleting || isArchiving || isSubmitting}
                    aria-label="Delete project"
                    className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                    {isDeleting ? "Deleting project" : "Delete project"}
                    <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                  </span>
                </div>
              )}
              {onArchive && (
                <div className="group relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleArchiveProject}
                    disabled={isArchiving || isDeleting || isSubmitting}
                    aria-label="Archive project"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
                  >
                    {isArchiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  </Button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                    {isArchiving ? "Archiving project" : "Archive project"}
                    <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="group relative">
                <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Cancel" disabled={isSubmitting || isArchiving || isDeleting}>
                  <X className="w-4 h-4" />
                </Button>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                  Cancel
                  <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                </span>
              </div>
              <div className="group relative">
                <Button type="submit" size="icon" className="bg-red-500 hover:bg-red-600" disabled={isSubmitting || isArchiving || isDeleting} aria-label="Update project">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </Button>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                  {isSubmitting ? "Updating project" : "Update project"}
                  <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black" />
                </span>
              </div>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

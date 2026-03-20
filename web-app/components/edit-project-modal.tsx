"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Organization, Project, User } from "@/lib/types"
import { UserAvatar } from "@/components/user-avatar"
import { Loader2, Mail, Plus, Search, Trash2, Users } from "lucide-react"

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
  ) => Promise<void>
  onUserAdd?: (userId: string, projectId: string) => Promise<void> | void
  onUserRemove?: (userId: string, projectId: string) => Promise<void> | void
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
  }, [project])

  const isManager =
    currentUserRole === "admin" ||
    currentUserRole === "super_admin" ||
    currentUserId === organization?.ownerId ||
    currentUserId === project?.ownerId

  const organizationMemberIds = useMemo(
    () => new Set(organization?.memberIds || users.map((user) => user.id)),
    [organization?.memberIds, users],
  )

  const projectMembers = useMemo(() => {
    return users.filter((user) => projectUserIds.includes(user.id))
  }, [projectUserIds, users])

  const availableUsers = useMemo(() => {
    const query = userSearchQuery.trim().toLowerCase()
    return users.filter((user) => {
      if (!organizationMemberIds.has(user.id) || projectUserIds.includes(user.id)) {
        return false
      }
      if (!query) return true
      const fullName = `${user.firstName} ${user.lastName}`.trim().toLowerCase()
      return fullName.includes(query) || user.email.toLowerCase().includes(query)
    })
  }, [organizationMemberIds, projectUserIds, userSearchQuery, users])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!project || !name.trim()) return

    setIsSubmitting(true)
    try {
      await onUpdate({
        name: name.trim(),
        description: description.trim() || undefined,
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
      await onUserInvite(inviteEmail, project.id, inviteFirstName, inviteLastName)
      setShowInviteUser(false)
      setInviteEmail("")
      setInviteFirstName("")
      setInviteLastName("")
    } finally {
      setIsInviting(false)
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
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="bg-zinc-800 border-zinc-700 min-h-[96px]"
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
                  {projectMembers.length} members
                </span>
              </div>

              {isManager && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowInviteUser(true)
                      setShowAddUser(false)
                    }}
                    className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    <Mail className="w-4 h-4" />
                    Invite
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAddUser(true)
                      setShowInviteUser(false)
                    }}
                    className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    <Plus className="w-4 h-4" />
                    Add Existing
                  </Button>
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
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowInviteUser(false)}
                      className="text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleInvite}
                      disabled={
                        isInviting || !inviteEmail || !inviteFirstName || !inviteLastName
                      }
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {isInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      Send Invite
                    </Button>
                  </div>
                </div>
              )}

              {showAddUser && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="project-user-search">Search Organization Users</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <Input
                        id="project-user-search"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        placeholder="Search by name or email"
                        className="bg-zinc-800 border-zinc-700 pl-10"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {availableUsers.map((user) => {
                      const displayName = user.name || `${user.firstName} ${user.lastName}`.trim()
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={async () => {
                            await onUserAdd?.(user.id, project.id)
                            setProjectUserIds((current) => Array.from(new Set([...current, user.id])))
                            setUserSearchQuery("")
                            setShowAddUser(false)
                          }}
                          className="w-full flex items-center gap-3 rounded-lg bg-zinc-800 px-3 py-2 text-left hover:bg-zinc-700 transition-colors"
                        >
                          <UserAvatar
                            name={displayName}
                            profileColor={user.profileColor}
                            memoji={user.profileMemoji}
                            size={32}
                            className="text-sm font-medium"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{displayName}</p>
                            <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                          </div>
                          <Plus className="w-4 h-4 text-zinc-400" />
                        </button>
                      )
                    })}
                    {availableUsers.length === 0 && (
                      <p className="text-sm text-zinc-500">No eligible organization users found.</p>
                    )}
                  </div>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-red-500 hover:bg-red-600" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

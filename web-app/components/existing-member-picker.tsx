"use client"

import { ReactNode } from "react"
import { Link2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserAvatar } from "@/components/user-avatar"
import { User } from "@/lib/types"

export function filterAvailableMembers(
  users: User[],
  includedUserIds: Iterable<string>,
  excludedUserIds: Iterable<string>,
  query: string,
) {
  const included = new Set(includedUserIds)
  const excluded = new Set(excludedUserIds)
  const normalizedQuery = query.trim().toLowerCase()

  return users.filter((user) => {
    if (!included.has(user.id) || excluded.has(user.id)) {
      return false
    }
    if (!normalizedQuery) return true

    const displayName = user.name || `${user.firstName} ${user.lastName}`.trim()
    return (
      displayName.toLowerCase().includes(normalizedQuery) ||
      user.email.toLowerCase().includes(normalizedQuery)
    )
  })
}

interface ExistingMemberPickerProps {
  searchId: string
  searchLabel: string
  searchPlaceholder?: string
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  users: User[]
  onSelect: (user: User) => void | Promise<void>
  emptyMessage: string
  actionIcon?: ReactNode
}

export function ExistingMemberPicker({
  searchId,
  searchLabel,
  searchPlaceholder = "Search by name or email",
  searchQuery,
  onSearchQueryChange,
  users,
  onSelect,
  emptyMessage,
  actionIcon,
}: ExistingMemberPickerProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={searchId}>{searchLabel}</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            id={searchId}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="bg-zinc-800 border-zinc-700 pl-10"
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-2">
        {users.map((user) => {
          const displayName = user.name || `${user.firstName} ${user.lastName}`.trim()

          return (
            <button
              key={user.id}
              type="button"
              onClick={() => void onSelect(user)}
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
              {actionIcon || <Link2 className="w-4 h-4 text-zinc-400" />}
            </button>
          )
        })}
        {users.length === 0 && <p className="text-sm text-zinc-500">{emptyMessage}</p>}
      </div>
    </div>
  )
}

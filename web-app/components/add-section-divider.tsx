"use client"

import { Plus } from 'lucide-react'

interface AddSectionDividerProps {
  onClick: () => void
  label?: string
  revealOnParentHover?: boolean
}

export function AddSectionDivider({
  onClick,
  label = "Add Section",
  revealOnParentHover = false,
}: AddSectionDividerProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full overflow-visible rounded-lg ${
        revealOnParentHover ? "h-full pointer-events-none justify-start" : "group h-2 items-center justify-center"
      }`}
    >
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 opacity-0 transition-all duration-200 ${
          revealOnParentHover
            ? "translate-y-2 group-hover/section:translate-y-0 group-hover/section:opacity-100 group-hover/section:bg-zinc-900/50 group-hover/section:text-zinc-300"
            : "translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 group-hover:bg-zinc-900/50 group-hover:text-zinc-300"
        }`}
      >
        <Plus className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{label}</span>
      </div>
    </button>
  )
}

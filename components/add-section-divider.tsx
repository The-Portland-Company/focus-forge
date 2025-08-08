"use client"

import { Plus } from 'lucide-react'

interface AddSectionDividerProps {
  onClick: () => void
  label?: string
}

export function AddSectionDivider({ onClick, label = "Add Section" }: AddSectionDividerProps) {
  return (
    <button
      onClick={onClick}
      className="w-full py-4 group hover:bg-zinc-900/50 transition-all rounded-lg"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-zinc-800 group-hover:bg-zinc-700 transition-colors" />
        <div className="flex items-center gap-2 text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">
          <Plus className="w-4 h-4" />
          <span>{label}</span>
        </div>
        <div className="flex-1 h-px bg-zinc-800 group-hover:bg-zinc-700 transition-colors" />
      </div>
    </button>
  )
}
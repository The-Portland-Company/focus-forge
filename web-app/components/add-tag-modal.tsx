"use client"

import { useState } from 'react'
import { X } from 'lucide-react'
import { Tag } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AddTagModalProps {
  isOpen: boolean
  onClose: () => void
  onAddTag: (tagData: Omit<Tag, 'id'>) => Promise<Tag | null> | Tag | null
  initialName?: string
  renderInStack?: boolean
  stackStyle?: React.CSSProperties
  stackZIndex?: number
}

const tagColors = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
]

export function AddTagModal({
  isOpen,
  onClose,
  onAddTag,
  initialName,
  renderInStack = false,
  stackStyle,
  stackZIndex
}: AddTagModalProps) {
  const [name, setName] = useState(initialName || '')
  const [selectedColor, setSelectedColor] = useState(tagColors[Math.floor(Math.random() * tagColors.length)])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    await onAddTag({
      name: name.trim(),
      color: selectedColor
    })

    setName('')
    setSelectedColor(tagColors[Math.floor(Math.random() * tagColors.length)])
    onClose()
  }

  if (!isOpen) return null

  const wrapperClass = renderInStack
    ? 'absolute inset-0 flex items-center justify-center pointer-events-none'
    : 'fixed inset-0 bg-black/50 flex items-center justify-center z-50'

  return (
    <div className={wrapperClass} style={renderInStack ? { zIndex: stackZIndex } : undefined}>
      <div
        className="bg-zinc-900 rounded-lg w-full max-w-md border border-zinc-800 pointer-events-auto"
        style={stackStyle}
      >
        <div className="border-b border-zinc-800 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Tag</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label htmlFor="name" className="text-sm text-zinc-400">Tag Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter tag name"
              className="mt-1"
              required
              autoFocus
            />
          </div>

          <div>
            <Label className="text-sm text-zinc-400">Color</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {tagColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    selectedColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Create Tag
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

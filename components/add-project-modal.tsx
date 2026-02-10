'use client'

import { useState, type CSSProperties } from 'react'
import { X, Calendar, DollarSign } from 'lucide-react'
import type { Project } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface AddProjectModalProps {
  isOpen: boolean
  onClose: () => void
  organizationId: string
  onAddProject: (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project | null> | Project | null | void | Promise<void>
  renderInStack?: boolean
  stackStyle?: CSSProperties
  stackZIndex?: number
}

const projectColors = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
]

export function AddProjectModal({
  isOpen,
  onClose,
  organizationId,
  onAddProject,
  renderInStack = false,
  stackStyle,
  stackZIndex
}: AddProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [selectedColor, setSelectedColor] = useState(projectColors[Math.floor(Math.random() * projectColors.length)])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) return
    
    onAddProject({
      name: name.trim(),
      description: description.trim() || undefined,
      color: selectedColor,
      organizationId,
      isFavorite: false,
      budget: budget ? parseFloat(budget) : undefined,
      deadline: deadline || undefined,
    })
    
    // Reset form
    setName('')
    setDescription('')
    setBudget('')
    setDeadline('')
    setSelectedColor(projectColors[Math.floor(Math.random() * projectColors.length)])
    onClose()
  }

  if (!isOpen) return null

  const wrapperClass = renderInStack
    ? 'absolute inset-0 flex items-center justify-center pointer-events-none'
    : 'fixed inset-0 bg-black/50 flex items-center justify-center z-50'

  return (
    <div className={wrapperClass} style={renderInStack ? { zIndex: stackZIndex } : undefined}>
      <div className="bg-zinc-900 rounded-lg w-full max-w-md pointer-events-auto" style={stackStyle}>
        <div className="border-b border-zinc-800 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Project</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label htmlFor="name" className="text-sm text-zinc-400">Project Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter project name"
              className="mt-1"
              required
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="description" className="text-sm text-zinc-400">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional project description"
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="budget" className="text-sm text-zinc-400">Budget</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  id="budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="0.00"
                  className="pl-10"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="deadline" className="text-sm text-zinc-400">Deadline</Label>
              <div className="relative mt-1">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  id="deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="pl-10 themed-date-input"
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm text-zinc-400">Color</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {projectColors.map((color) => (
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
              Create Project
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

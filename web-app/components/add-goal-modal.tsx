"use client"

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export interface AddGoalPayload {
  name: string
  description?: string
  sectionId?: string
  projectId: string
  order: number
}

interface AddGoalModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (goal: AddGoalPayload) => void
  projectId: string
  sectionId?: string
  order: number
}

export function AddGoalModal({ isOpen, onClose, onSave, projectId, sectionId, order }: AddGoalModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (isOpen) return
    setName('')
    setDescription('')
  }, [isOpen])

  if (!isOpen) return null

  const isSectionGoal = Boolean(sectionId)
  const title = 'Add Goal'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      sectionId,
      projectId,
      order,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isSectionGoal ? "Goal name" : "Project-level goal name"}
                className="w-full bg-zinc-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 ring-theme transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                className="w-full bg-zinc-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 ring-theme transition-all resize-none"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 btn-theme-primary text-white rounded-lg transition-all"
              disabled={!name.trim()}
            >
              Add Goal
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

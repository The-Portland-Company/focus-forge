"use client"

import { useState } from 'react'
import { X, Palette, FileText, Smile } from 'lucide-react'
import { Section } from '@/lib/types'

interface AddSectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (section: Omit<Section, 'id' | 'createdAt' | 'updatedAt'>) => void
  projectId: string
  parentId?: string
  order: number
}

const iconOptions = [
  { value: '📁', label: 'Folder' },
  { value: '📋', label: 'Clipboard' },
  { value: '🎯', label: 'Target' },
  { value: '💡', label: 'Idea' },
  { value: '⚡', label: 'Lightning' },
  { value: '🔥', label: 'Fire' },
  { value: '💎', label: 'Gem' },
  { value: '🚀', label: 'Rocket' },
  { value: '⭐', label: 'Star' },
  { value: '🏆', label: 'Trophy' }
]

const colorOptions = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
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
  '#6b7280'  // gray
]

export function AddSectionModal({ isOpen, onClose, onSave, projectId, parentId, order }: AddSectionModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(colorOptions[0])
  const [icon, setIcon] = useState(iconOptions[0].value)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      icon,
      projectId,
      parentId,
      order
    })

    // Reset form
    setName('')
    setDescription('')
    setColor(colorOptions[0])
    setIcon(iconOptions[0].value)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Add Section</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Section Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Section name"
                className="w-full bg-zinc-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 ring-theme transition-all"
                autoFocus
              />
            </div>

            {/* Description */}
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

            {/* Color and Icon */}
            <div className="flex gap-4">
              {/* Color Picker */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Color
                </label>
                <button
                  type="button"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="w-full bg-zinc-800 text-white rounded px-3 py-2 flex items-center gap-2 hover:bg-zinc-700 transition-colors"
                >
                  <div
                    className="w-5 h-5 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <Palette className="w-4 h-4" />
                  <span className="text-sm">Choose color</span>
                </button>
                
                {showColorPicker && (
                  <div className="absolute mt-2 bg-zinc-800 rounded-lg p-3 shadow-lg z-10">
                    <div className="grid grid-cols-6 gap-2">
                      {colorOptions.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setColor(c)
                            setShowColorPicker(false)
                          }}
                          className={`w-8 h-8 rounded ${color === c ? 'ring-2 ring-white' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Icon Picker */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Icon
                </label>
                <button
                  type="button"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  className="w-full bg-zinc-800 text-white rounded px-3 py-2 flex items-center gap-2 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-lg">{icon}</span>
                  <Smile className="w-4 h-4" />
                  <span className="text-sm">Choose icon</span>
                </button>
                
                {showIconPicker && (
                  <div className="absolute mt-2 bg-zinc-800 rounded-lg p-3 shadow-lg z-10">
                    <div className="grid grid-cols-5 gap-2">
                      {iconOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setIcon(opt.value)
                            setShowIconPicker(false)
                          }}
                          className={`w-10 h-10 rounded flex items-center justify-center text-xl hover:bg-zinc-700 ${
                            icon === opt.value ? 'bg-zinc-700 ring-2 ring-white' : ''
                          }`}
                          title={opt.label}
                        >
                          {opt.value}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
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
              Add Section
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
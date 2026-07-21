"use client"

import { useEffect, useState } from 'react'
import { X, Palette, Loader2 } from 'lucide-react'
import { Section } from '@/lib/types'
import {
  SECTION_ICONS,
  DEFAULT_SECTION_ICON_KEY,
  getSectionIcon,
  resolveSectionIconKey,
} from '@/lib/section-icons'

interface AddSectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (section: Omit<Section, 'id' | 'createdAt' | 'updatedAt'>) => void
  projectId: string
  parentId?: string
  goalId?: string
  order: number
  /** When set, the modal edits this section instead of creating a new one. */
  section?: Section | null
}

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

export function AddSectionModal({ isOpen, onClose, onSave, projectId, parentId, goalId, order, section }: AddSectionModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(colorOptions[0])
  const [icon, setIcon] = useState<string>(DEFAULT_SECTION_ICON_KEY)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  // Spinner while the submit handler runs. The parent closes the modal as soon
  // as it has the values, so this shows only for the moment before that — it
  // marks the click as received rather than reporting on the request.
  const [isSaving, setIsSaving] = useState(false)

  // Seed the form when opening (from the edited section, if any) and clear it
  // on close so a later "add" never inherits the last edit's values.
  useEffect(() => {
    setName(isOpen ? section?.name ?? '' : '')
    setDescription(isOpen ? section?.description ?? '' : '')
    setColor((isOpen && section?.color) || colorOptions[0])
    setIcon((isOpen && section?.icon) || DEFAULT_SECTION_ICON_KEY)
    setShowColorPicker(false)
    setShowIconPicker(false)
    setIsSaving(false)
  }, [isOpen, section])

  if (!isOpen) return null

  const SelectedIcon = getSectionIcon(icon)
  const selectedIconKey = resolveSectionIconKey(icon)
  const isEditing = Boolean(section)
  const isSubSection = Boolean(parentId ?? section?.parentId)
  const title = isEditing
    ? 'Edit Task List'
    : isSubSection
      ? 'Add Sub-Section'
      : 'Add Task List'
  const submitLabel = isEditing ? 'Save Changes' : title

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || isSaving) return
    setIsSaving(true)

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      icon,
      projectId,
      parentId: parentId ?? section?.parentId,
      goalId: goalId ?? section?.goalId,
      order
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
            {/* Section Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isSubSection ? "Sub-section name" : "Section name"}
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
                  <SelectedIcon className="w-5 h-5" />
                  <span className="text-sm">Choose icon</span>
                </button>
                
                {showIconPicker && (
                  <div className="absolute mt-2 bg-zinc-800 rounded-lg p-3 shadow-lg z-10">
                    <div className="grid grid-cols-5 gap-2">
                      {SECTION_ICONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setIcon(opt.key)
                            setShowIconPicker(false)
                          }}
                          className={`w-10 h-10 rounded flex items-center justify-center text-zinc-200 hover:bg-zinc-700 ${
                            selectedIconKey === opt.key ? 'bg-zinc-700 ring-2 ring-white' : ''
                          }`}
                          title={opt.label}
                        >
                          <opt.Icon className="w-5 h-5" />
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
              className="flex items-center gap-2 px-4 py-2 btn-theme-primary text-white rounded-lg transition-all disabled:opacity-70"
              disabled={!name.trim() || isSaving}
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

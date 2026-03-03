'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Organization } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AddOrganizationModalProps {
  isOpen: boolean
  onClose: () => void
  onAddOrganization: (organizationData: Omit<Organization, 'id'>) => void
}

const organizationColors = [
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

export function AddOrganizationModal({ isOpen, onClose, onAddOrganization }: AddOrganizationModalProps) {
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState(organizationColors[Math.floor(Math.random() * organizationColors.length)])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) return
    
    onAddOrganization({
      name: name.trim(),
      color: selectedColor,
    })
    
    // Reset form
    setName('')
    setSelectedColor(organizationColors[Math.floor(Math.random() * organizationColors.length)])
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg w-full max-w-md">
        <div className="border-b border-zinc-800 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Organization</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label htmlFor="name" className="text-sm text-zinc-400">Organization Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter organization name"
              className="mt-1"
              required
              autoFocus
            />
          </div>

          <div>
            <Label className="text-sm text-zinc-400">Color</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {organizationColors.map((color) => (
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
              Create Organization
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
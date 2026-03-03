"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Organization } from '@/lib/types'

interface EditOrganizationModalProps {
  isOpen: boolean
  onClose: () => void
  organization: Organization | null
  onUpdate: (orgData: Partial<Organization>) => void
}

export function EditOrganizationModal({ isOpen, onClose, organization, onUpdate }: EditOrganizationModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#ef4444')

  useEffect(() => {
    if (organization) {
      setName(organization.name)
      setColor(organization.color)
    }
  }, [organization])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) return
    
    onUpdate({
      name: name.trim(),
      color
    })
    
    onClose()
  }

  if (!organization) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update the organization details
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Organization name"
                className="bg-zinc-800 border-zinc-700"
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-20 h-10 bg-zinc-800 border-zinc-700"
                />
                <span className="text-sm text-zinc-400">{color}</span>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-red-500 hover:bg-red-600">
              Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
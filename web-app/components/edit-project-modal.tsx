"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Project } from '@/lib/types'

interface EditProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project | null
  onUpdate: (projectData: Partial<Project>) => void
}

export function EditProjectModal({ isOpen, onClose, project, onUpdate }: EditProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#ef4444')
  const [budget, setBudget] = useState<string>('')
  const [deadline, setDeadline] = useState('')

  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description || '')
      setColor(project.color)
      setBudget(project.budget?.toString() || '')
      setDeadline(project.deadline || '')
    }
  }, [project])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) return
    
    onUpdate({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      budget: budget ? parseFloat(budget) : undefined,
      deadline: deadline || undefined
    })
    
    onClose()
  }

  if (!project) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update the project details
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                className="bg-zinc-800 border-zinc-700"
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="bg-zinc-800 border-zinc-700 min-h-[80px]"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                  <Input
                    id="budget"
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="bg-zinc-800 border-zinc-700 pl-8"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 themed-date-input"
                />
              </div>
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
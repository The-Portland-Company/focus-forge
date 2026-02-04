"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Check, ChevronDown } from 'lucide-react'
import { Project, Task } from '@/lib/types'

type Step = 'choose' | 'reassign' | 'confirm-delete'

interface DeleteProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project | null
  tasks: Task[]
  projects: Project[]
  onDeleteAll: (projectId: string) => Promise<void>
  onReassignAndDelete: (projectId: string, reassignTaskIds: string[], targetProjectId: string) => Promise<void>
}

export function DeleteProjectModal({
  isOpen,
  onClose,
  project,
  tasks,
  projects,
  onDeleteAll,
  onReassignAndDelete,
}: DeleteProjectModalProps) {
  const [step, setStep] = useState<Step>('choose')
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [targetProjectId, setTargetProjectId] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)

  const availableProjects = projects.filter(
    p => p.id !== project?.id && !p.archived && p.organizationId === project?.organizationId
  )

  const allSelected = tasks.length > 0 && selectedTaskIds.size === tasks.length
  const noneSelected = selectedTaskIds.size === 0

  const handleClose = () => {
    setStep('choose')
    setSelectedTaskIds(new Set())
    setTargetProjectId('')
    setIsProcessing(false)
    setShowProjectDropdown(false)
    onClose()
  }

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedTaskIds(new Set())
    } else {
      setSelectedTaskIds(new Set(tasks.map(t => t.id)))
    }
  }

  const handleDeleteAll = async () => {
    if (!project) return
    setIsProcessing(true)
    try {
      await onDeleteAll(project.id)
      handleClose()
    } catch {
      setIsProcessing(false)
    }
  }

  const handleReassign = async () => {
    if (!project || !targetProjectId) return
    setIsProcessing(true)
    try {
      await onReassignAndDelete(project.id, Array.from(selectedTaskIds), targetProjectId)
      handleClose()
    } catch {
      setIsProcessing(false)
    }
  }

  const targetProject = availableProjects.find(p => p.id === targetProjectId)

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        {step === 'choose' && (
          <>
            <DialogHeader>
              <DialogTitle>Delete "{project?.name}"</DialogTitle>
              <DialogDescription className="text-zinc-400">
                This project has {tasks.length} task{tasks.length !== 1 ? 's' : ''}. What would you like to do?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 mt-2">
              {tasks.length > 0 && availableProjects.length > 0 && (
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  onClick={() => {
                    setSelectedTaskIds(new Set(tasks.map(t => t.id)))
                    setStep('reassign')
                  }}
                >
                  <div className="text-left">
                    <div className="font-medium">Reassign Tasks</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Move tasks to another project before deleting</div>
                  </div>
                </Button>
              )}
              <Button
                variant="outline"
                className="justify-start h-auto py-3 px-4 border-red-900/50 hover:bg-red-950/30"
                onClick={() => setStep('confirm-delete')}
              >
                <div className="text-left">
                  <div className="font-medium text-red-400">Delete All</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Delete all tasks and the project</div>
                </div>
              </Button>
            </div>
            <DialogFooter className="mt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {step === 'reassign' && (
          <>
            <DialogHeader>
              <DialogTitle>Reassign Tasks</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Select tasks to keep and choose a destination project. Unselected tasks will be deleted.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-2">
              {/* Select all toggle */}
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  allSelected ? 'bg-blue-600 border-blue-600' : 'border-zinc-600'
                }`}>
                  {allSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>

              {/* Task list */}
              <div className="max-h-60 overflow-y-auto space-y-1 border border-zinc-800 rounded-lg p-2">
                {tasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      selectedTaskIds.has(task.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-600'
                    }`}>
                      {selectedTaskIds.has(task.id) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-zinc-200 truncate">{task.name}</span>
                  </button>
                ))}
              </div>

              {/* Destination project dropdown */}
              <div className="relative">
                <label className="text-xs text-zinc-400 mb-1 block">Move selected tasks to:</label>
                <button
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 hover:border-zinc-600 transition-colors"
                >
                  {targetProject ? (
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: targetProject.color }} />
                      {targetProject.name}
                    </span>
                  ) : (
                    <span className="text-zinc-500">Select a project...</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </button>
                {showProjectDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-10 max-h-40 overflow-y-auto">
                    {availableProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setTargetProjectId(p.id)
                          setShowProjectDropdown(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setStep('choose')}>Back</Button>
              <Button
                variant="default"
                disabled={noneSelected || !targetProjectId || isProcessing}
                onClick={handleReassign}
              >
                {isProcessing ? 'Processing...' : `Reassign ${selectedTaskIds.size} Task${selectedTaskIds.size !== 1 ? 's' : ''} & Delete Project`}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'confirm-delete' && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription className="text-zinc-400">
                This will permanently delete "{project?.name}" and all {tasks.length} task{tasks.length !== 1 ? 's' : ''} in it. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="outline" onClick={() => setStep('choose')}>Back</Button>
              <Button
                variant="destructive"
                disabled={isProcessing}
                onClick={handleDeleteAll}
              >
                {isProcessing ? 'Deleting...' : 'Delete Everything'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

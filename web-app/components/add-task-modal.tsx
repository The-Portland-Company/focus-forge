"use client"

import { TaskModal } from './task-modal'
import { Database, Task } from '@/lib/types'

interface AddTaskModalProps {
  isOpen: boolean
  onClose: () => void
  data: Database
  onAddTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | Partial<Task>) => void
  onDataRefresh?: () => void
  defaultProjectId?: string
}

export function AddTaskModal({ 
  isOpen, 
  onClose, 
  data, 
  onAddTask, 
  onDataRefresh, 
  defaultProjectId 
}: AddTaskModalProps) {
  return (
    <TaskModal
      isOpen={isOpen}
      onClose={onClose}
      data={data}
      onSave={onAddTask}
      onDataRefresh={onDataRefresh}
      defaultProjectId={defaultProjectId}
    />
  )
}
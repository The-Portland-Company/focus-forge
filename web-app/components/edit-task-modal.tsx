'use client'

import { TaskModal } from './task-modal'
import { Task, Database } from '@/lib/types'

interface EditTaskModalProps {
  isOpen: boolean
  onClose: () => void
  task: Task | null
  data: Database
  onSave: (taskData: Partial<Task>) => void
  onDelete: (taskId: string) => void
  onDataRefresh?: () => void
  onTaskSelect?: (task: Task) => void
}

export function EditTaskModal({ 
  isOpen, 
  onClose, 
  task, 
  data, 
  onSave, 
  onDelete, 
  onDataRefresh, 
  onTaskSelect 
}: EditTaskModalProps) {
  return (
    <TaskModal
      isOpen={isOpen}
      onClose={onClose}
      data={data}
      task={task}
      onSave={onSave}
      onDelete={onDelete}
      onDataRefresh={onDataRefresh}
      onTaskSelect={onTaskSelect}
    />
  )
}
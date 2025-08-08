"use client"

import { AlertCircle } from 'lucide-react'

interface RescheduleConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  taskCount: number
}

export function RescheduleConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  taskCount 
}: RescheduleConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="bg-amber-500/10 p-3 rounded-full">
              <AlertCircle className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">
                Reschedule Overdue Tasks?
              </h3>
              <p className="text-zinc-400 text-sm">
                This will reschedule {taskCount} overdue {taskCount === 1 ? 'task' : 'tasks'} to today&apos;s date. 
                This action cannot be undone.
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
          >
            Reschedule All
          </button>
        </div>
      </div>
    </div>
  )
}
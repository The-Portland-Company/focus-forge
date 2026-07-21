'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastProps {
  toast: Toast
  onClose: (id: string) => void
}

function ToastItem({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onClose(toast.id)
      }, toast.duration)
      return () => clearTimeout(timer)
    }
  }, [toast, onClose])

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />
  }

  const bgColors = {
    success: 'bg-green-500/10 border-green-500/20',
    error: 'bg-red-500/10 border-red-500/20',
    warning: 'bg-yellow-500/10 border-yellow-500/20',
    info: 'bg-blue-500/10 border-blue-500/20'
  }

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${bgColors[toast.type]} backdrop-blur-sm animate-slide-in`}>
      {icons[toast.type]}
      <div className="flex-1">
        <h4 className="font-medium text-sm">{toast.title}</h4>
        {toast.message && (
          <p className="text-xs text-zinc-400 mt-1">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onClose(toast.id)}
        className="p-1 hover:bg-zinc-700 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onClose: (id: string) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    // Centered along the bottom edge: these confirm an action the user just
    // took, so they belong under the cursor's attention rather than off in a
    // corner. Full width is capped so a long message stays readable.
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 space-y-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  )
}
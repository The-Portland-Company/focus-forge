'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { ToastContainer, Toast, ToastType } from '@/components/toast'

interface ToastContextType {
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void
  showSuccess: (title: string, message?: string) => void
  showError: (title: string, message?: string) => void
  showWarning: (title: string, message?: string) => void
  showInfo: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (type: ToastType, title: string, message?: string, duration: number = 5000) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, title, message, duration }])
  }

  const showSuccess = (title: string, message?: string) => {
    showToast('success', title, message)
  }

  const showError = (title: string, message?: string) => {
    // Duration 0 disables the auto-dismiss timer. A failure needs to be read
    // and acknowledged — dismissing it on a timer means the user can miss that
    // their action did not take effect. Closed with the toast's own button.
    showToast('error', title, message, 0)
  }

  const showWarning = (title: string, message?: string) => {
    showToast('warning', title, message, 7000)
  }

  const showInfo = (title: string, message?: string) => {
    showToast('info', title, message)
  }

  const handleClose = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      <ToastContainer toasts={toasts} onClose={handleClose} />
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
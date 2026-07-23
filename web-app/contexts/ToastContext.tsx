'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react'
import {
  ALERT_DEFAULT_DURATION_MS,
  dismissAlert as dismissAlertPure,
  upsertAlert as upsertAlertPure,
  type AlertType,
  type AppAlert,
} from '@/lib/alert-center'
import { AlertCenterStack } from '@/components/alert-center'

/** Back-compat alias — the pre-alert-center API called this ToastType. */
export type ToastType = Exclude<AlertType, 'progress'>

interface ToastContextType {
  // Original toast API, unchanged for its 12 call sites. Toasts are now
  // alerts in the top-right alert center instead of bottom-centre pop-ups.
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void
  showSuccess: (title: string, message?: string) => void
  showError: (title: string, message?: string) => void
  showWarning: (title: string, message?: string) => void
  showInfo: (title: string, message?: string) => void
  // Full alert-center API (progress states, actions, upsert-by-id).
  alerts: AppAlert[]
  upsertAlert: (alert: Omit<AppAlert, 'createdAt'> & { createdAt?: number }) => void
  dismissAlert: (id: string) => void
  dismissAllAlerts: () => void
  isPanelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AppAlert[]>([])
  const [isPanelOpen, setPanelOpen] = useState(false)
  // Distinguishes same-millisecond toasts (the old Date.now() id collided).
  const alertSeqRef = useRef(0)

  const upsertAlert = useCallback(
    (alert: Omit<AppAlert, 'createdAt'> & { createdAt?: number }) => {
      setAlerts((current) =>
        upsertAlertPure(current, {
          createdAt: alert.createdAt ?? Date.now(),
          ...alert,
        }),
      )
    },
    [],
  )

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => dismissAlertPure(current, id))
  }, [])

  const dismissAllAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, duration?: number) => {
      upsertAlert({
        id: `toast-${Date.now()}-${++alertSeqRef.current}`,
        type,
        title,
        message,
        duration: duration ?? ALERT_DEFAULT_DURATION_MS[type],
      })
    },
    [upsertAlert],
  )

  const value = useMemo<ToastContextType>(
    () => ({
      showToast,
      showSuccess: (title, message) => showToast('success', title, message),
      // Errors stay sticky (duration 0): a failure needs to be read and
      // acknowledged, not silently expire.
      showError: (title, message) => showToast('error', title, message, 0),
      showWarning: (title, message) => showToast('warning', title, message),
      showInfo: (title, message) => showToast('info', title, message),
      alerts,
      upsertAlert,
      dismissAlert,
      dismissAllAlerts,
      isPanelOpen,
      setPanelOpen,
    }),
    [alerts, dismissAlert, dismissAllAlerts, isPanelOpen, showToast, upsertAlert],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <AlertCenterStack />
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

/** Alias with the full surface named for what it is now. */
export const useAlertCenter = useToast

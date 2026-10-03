"use client"

import { useEffect, useState } from 'react'
import { Link2, Loader2, RefreshCw } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'

interface SpecsConnectorStatus {
  id: string
  enabled: boolean
  last_inbound_at: string | null
  last_outbound_at: string | null
  pending_outbox: number
  dead_letters: number
}

/** Org > Connectors > Politogy: Specs. See politogy/docs/sync-contract.md. */
export function SpecsConnectorSettings() {
  const { showSuccess, showError } = useToast()
  const [status, setStatus] = useState<SpecsConnectorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/connectors/specs/status', { credentials: 'include' })
      if (!res.ok) return
      const body = await res.json()
      setStatus(body?.data ?? null)
    } catch (error) {
      console.error('Error loading Specs connector status:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const toggle = async () => {
    if (!status) return
    setToggling(true)
    try {
      const res = await fetch('/api/connectors/specs/status', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      })
      if (!res.ok) {
        showError('Failed to update the Specs connector')
        return
      }
      const body = await res.json()
      setStatus(body?.data ?? null)
      showSuccess(body?.data?.enabled ? 'Specs sync enabled' : 'Specs sync paused')
    } catch (error) {
      console.error('Error toggling Specs connector:', error)
      showError('Failed to update the Specs connector')
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Politogy: Specs</h3>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : (
          <button
            onClick={() => void toggle()}
            disabled={toggling || !status}
            className={`text-xs px-3 py-1 rounded-full font-medium ${
              status?.enabled
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {status?.enabled ? 'Enabled' : 'Paused'}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Two-way sync of locked Specs projects, sections, goals and tasks with
        specs.politogyvrm.com.
      </p>
      {status && (
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div>Last inbound: {status.last_inbound_at ? new Date(status.last_inbound_at).toLocaleString() : 'never'}</div>
          <div>Last outbound: {status.last_outbound_at ? new Date(status.last_outbound_at).toLocaleString() : 'never'}</div>
          <div>Pending outbox: {status.pending_outbox}</div>
          <div>Dead letters: {status.dead_letters}</div>
        </div>
      )}
      <button
        onClick={() => void load()}
        className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <RefreshCw className="w-3 h-3" /> Refresh
      </button>
    </div>
  )
}

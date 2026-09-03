'use client'

import { useEffect, useState, useCallback } from 'react'
import { HardDrive, Check, Loader2 } from 'lucide-react'

/**
 * Per-organization media storage account. Proof screenshots / screen recordings
 * (from the DevNotes overlay, and any opt-in Forge attachment) are stored in the
 * organization's OWN Snap Shoot Share account, so each org keeps — and pays for —
 * its own media. Reads/writes go through /api/organizations/[id]/media-storage,
 * which requires org admin/owner. The token is write-only: it is never returned
 * by the API, so an empty token field keeps whatever is already stored.
 */

interface MediaStorageStatus {
  provider: string
  endpoint: string
  label: string
  configured: boolean
  updatedAt: string | null
}

interface Props {
  organizationId: string
  isOwner: boolean
}

const DEFAULT_ENDPOINT =
  'https://snap-shoot-share-api.the-portland-company.workers.dev'

export function OrganizationMediaStorage({ organizationId, isOwner }: Props) {
  const [status, setStatus] = useState<MediaStorageStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT)
  const [token, setToken] = useState('')

  const applyStatus = useCallback((s: MediaStorageStatus) => {
    setStatus(s)
    setLabel(s.label || '')
    setEndpoint(s.endpoint || DEFAULT_ENDPOINT)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/media-storage`,
        )
        if (!res.ok) throw new Error('Failed to load media storage')
        const data = await res.json()
        if (!cancelled && data?.settings) applyStatus(data.settings)
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, applyStatus])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/media-storage`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label,
            endpoint,
            ...(token.trim() ? { token: token.trim() } : {}),
          }),
        },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to save')
      }
      const data = await res.json()
      if (data?.settings) applyStatus(data.settings)
      setToken('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/media-storage`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error('Failed to disconnect')
      const data = await res.json()
      if (data?.settings) applyStatus(data.settings)
      setToken('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <HardDrive className="w-4 h-4 text-zinc-400" />
        <h3 className="text-sm font-medium">Media Storage</h3>
        {status?.configured && (
          <span className="inline-flex items-center gap-1 text-xs text-green-400">
            <Check className="w-3 h-3" /> Connected
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-3">
        Proof screenshots and screen recordings are stored in this
        organization&rsquo;s own Snap&nbsp;Shoot&nbsp;Share account. Leave the
        token blank to keep the one already saved. Members without an account
        fall back to the default Forge attachment storage.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={!isOwner || saving}
              placeholder="e.g. Acme storage account"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none disabled:opacity-50 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Account token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={!isOwner || saving}
              placeholder={
                status?.configured ? '•••••••• (saved)' : 'tpc_live_…'
              }
              autoComplete="off"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none disabled:opacity-50 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Storage endpoint
            </label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              disabled={!isOwner || saving}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-theme-primary focus:outline-none disabled:opacity-50 text-sm font-mono"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 bg-theme-primary text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
              {status?.configured && (
                <button
                  onClick={disconnect}
                  disabled={saving}
                  className="px-3 py-1.5 border border-zinc-700 text-zinc-300 rounded-lg text-sm hover:bg-zinc-800 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          )}
          {!isOwner && (
            <p className="text-xs text-zinc-500">
              Only an organization owner can change the storage account.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

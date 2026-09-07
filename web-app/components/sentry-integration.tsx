"use client"

import { useState, useEffect } from 'react'
import {
  Link2,
  Unlink,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Clock,
  Bug,
  Trash2,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { createClient } from '@/lib/supabase/client'

interface SentryIntegrationProps {
  userId: string
}

interface SentryProject {
  id: string
  slug: string
  name: string
  platform?: string | null
}

interface ForgeProject {
  id: string
  name: string
}

interface SentryMapping {
  id: string
  sentry_project_slug: string
  sentry_org_slug: string
  forge_project_id: string
  sync_enabled?: boolean
  last_sync_at?: string | null
}

export function SentryIntegration({ userId }: SentryIntegrationProps) {
  const { showSuccess, showError, showInfo } = useToast()
  const [isConnected, setIsConnected] = useState(false)
  const [token, setToken] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [connectedOrgSlug, setConnectedOrgSlug] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [sentryProjects, setSentryProjects] = useState<SentryProject[]>([])
  const [forgeProjects, setForgeProjects] = useState<ForgeProject[]>([])
  const [mappings, setMappings] = useState<SentryMapping[]>([])
  // Per-Sentry-project dropdown selection (sentry slug -> forge project id).
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [savingSlug, setSavingSlug] = useState<string | null>(null)

  useEffect(() => {
    checkConnectionStatus()
    loadForgeProjects()
  }, [userId])

  const checkConnectionStatus = async () => {
    try {
      const supabase = createClient() as any
      const { data: profile } = await supabase
        .from('profiles')
        .select('sentry_auth_token, sentry_org_slug, sentry_base_url, sentry_sync_enabled')
        .eq('id', userId)
        .single()

      if (profile?.sentry_auth_token) {
        setIsConnected(true)
        setConnectedOrgSlug(profile.sentry_org_slug || '')
        setSyncEnabled(profile.sentry_sync_enabled || false)
        await loadMappings()
      }
    } catch (error) {
      console.error('Error checking Sentry connection status:', error)
    }
  }

  const loadForgeProjects = async () => {
    try {
      const response = await fetch('/api/database', { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      const projects: ForgeProject[] = (data?.projects || [])
        .filter((p: any) => !p.archived)
        .map((p: any) => ({ id: p.id, name: p.name }))
      setForgeProjects(projects)
    } catch (error) {
      console.error('Error loading Forge projects:', error)
    }
  }

  const loadMappings = async () => {
    try {
      const response = await fetch('/api/sentry/mappings', {
        credentials: 'include',
      })
      if (!response.ok) return
      const data = await response.json()
      setMappings(Array.isArray(data?.mappings) ? data.mappings : [])
    } catch (error) {
      console.error('Error loading Sentry mappings:', error)
    }
  }

  const handleConnect = async () => {
    const trimmedToken = token.trim()
    const trimmedOrg = orgSlug.trim()
    if (!trimmedToken) {
      showError('Token Required', 'Please enter your Sentry auth token')
      return
    }
    if (!trimmedOrg) {
      showError('Org Slug Required', 'Please enter your Sentry organization slug')
      return
    }

    setIsConnecting(true)
    try {
      const response = await fetch('/api/sentry/connect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: trimmedToken,
          orgSlug: trimmedOrg,
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        }),
      })

      const result = await response.json()

      if (response.ok) {
        showSuccess('Connected!', 'Successfully connected to Sentry')
        setIsConnected(true)
        setConnectedOrgSlug(trimmedOrg)
        setSentryProjects(Array.isArray(result?.projects) ? result.projects : [])
        setToken('')
        await loadMappings()
      } else {
        showError('Connection Failed', result?.error || 'Failed to connect to Sentry')
      }
    } catch (error) {
      showError('Connection Error', 'Failed to connect to Sentry')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleMap = async (sentryProjectSlug: string) => {
    const forgeProjectId = selection[sentryProjectSlug]
    if (!forgeProjectId) {
      showError('Pick a Project', 'Choose a Forge project to map to')
      return
    }

    setSavingSlug(sentryProjectSlug)
    try {
      const response = await fetch('/api/sentry/mappings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentryProjectSlug,
          sentryOrgSlug: connectedOrgSlug,
          forgeProjectId,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        showSuccess('Mapped', `${sentryProjectSlug} will sync into your Forge project`)
        await loadMappings()
      } else {
        showError('Mapping Failed', result?.error || 'Failed to save mapping')
      }
    } catch (error) {
      showError('Mapping Error', 'Failed to save mapping')
    } finally {
      setSavingSlug(null)
    }
  }

  const handleDeleteMapping = async (id: string) => {
    try {
      const response = await fetch(`/api/sentry/mappings?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (response.ok) {
        showSuccess('Removed', 'Mapping removed')
        setMappings((prev) => prev.filter((m) => m.id !== id))
      } else {
        const result = await response.json().catch(() => null)
        showError('Failed', result?.error || 'Could not remove mapping')
      }
    } catch (error) {
      showError('Error', 'Could not remove mapping')
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    showInfo('Syncing', 'Pulling unresolved Sentry issues...')
    try {
      const response = await fetch('/api/sentry/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const result = await response.json()

      if (response.ok) {
        showSuccess(
          'Sync Complete',
          `${result?.created ?? 0} created, ${result?.skipped ?? 0} skipped`,
        )
        await loadMappings()
      } else {
        showError('Sync Failed', result?.error || 'Failed to sync from Sentry')
      }
    } catch (error) {
      showError('Sync Error', 'Failed to sync from Sentry')
    } finally {
      setIsSyncing(false)
    }
  }

  const toggleSync = async () => {
    try {
      const supabase = createClient() as any
      const newValue = !syncEnabled
      const { error } = await supabase
        .from('profiles')
        .update({ sentry_sync_enabled: newValue })
        .eq('id', userId)

      if (!error) {
        setSyncEnabled(newValue)
        showSuccess('Updated', `Sync ${newValue ? 'enabled' : 'disabled'}`)
      } else {
        showError('Error', 'Failed to update sync setting')
      }
    } catch (error) {
      showError('Error', 'Failed to update sync setting')
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect from Sentry? Your mappings will be preserved.')) {
      return
    }
    try {
      const supabase = createClient() as any
      const { error } = await supabase
        .from('profiles')
        .update({ sentry_auth_token: null, sentry_sync_enabled: false })
        .eq('id', userId)

      if (!error) {
        showSuccess('Disconnected', 'Disconnected from Sentry')
        setIsConnected(false)
        setSentryProjects([])
        setSyncEnabled(false)
      } else {
        showError('Error', 'Failed to disconnect from Sentry')
      }
    } catch (error) {
      showError('Error', 'Failed to disconnect from Sentry')
    }
  }

  const forgeProjectName = (id: string) =>
    forgeProjects.find((p) => p.id === id)?.name || id

  if (!isConnected) {
    return (
      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Sentry Integration
          </h3>
          <span className="text-sm text-zinc-500">Not connected</span>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Connect Sentry to turn unresolved issues into Forge tasks and resolve
          them back in Sentry when the task is completed.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Auth Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your Sentry auth token"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Organization Slug
            </label>
            <input
              type="text"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              placeholder="my-org"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Base URL <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://sentry.io"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Only needed for self-hosted Sentry. Defaults to https://sentry.io.
            </p>
          </div>

          <button
            onClick={handleConnect}
            disabled={isConnecting || !token.trim() || !orgSlug.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                Connect Sentry
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Bug className="w-5 h-5 text-purple-500" />
          Sentry Integration
        </h3>
        <span className="flex items-center gap-1 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          Connected
        </span>
      </div>

      {connectedOrgSlug && (
        <div className="mb-4 p-3 bg-zinc-800 rounded-lg text-sm text-zinc-300">
          Organization: <span className="font-medium">{connectedOrgSlug}</span>
        </div>
      )}

      {/* Sync Controls */}
      <div className="space-y-4 mb-6">
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="w-full px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSyncing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Sync Now
            </>
          )}
        </button>

        {/* Sync Toggle */}
        <div className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-zinc-400" />
            <div>
              <p className="text-sm">Sync enabled</p>
              <p className="text-xs text-zinc-400">
                Pull unresolved issues into mapped Forge projects
              </p>
            </div>
          </div>
          <button
            onClick={toggleSync}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              syncEnabled ? 'bg-blue-600' : 'bg-zinc-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                syncEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Project Mapping (available right after connect this session) */}
      {sentryProjects.length > 0 && (
        <div className="border-t border-zinc-800 pt-4 mb-6">
          <h4 className="text-sm font-medium mb-3">Map Sentry Projects</h4>
          <div className="space-y-3">
            {sentryProjects.map((sp) => (
              <div key={sp.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{sp.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{sp.slug}</p>
                </div>
                <select
                  value={selection[sp.slug] ?? ''}
                  onChange={(e) =>
                    setSelection((prev) => ({ ...prev, [sp.slug]: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select Forge project…</option>
                  {forgeProjects.map((fp) => (
                    <option key={fp.id} value={fp.id}>
                      {fp.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleMap(sp.slug)}
                  disabled={savingSlug === sp.slug || !selection[sp.slug]}
                  className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-1"
                >
                  {savingSlug === sp.slug ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Map'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing mappings */}
      <div className="border-t border-zinc-800 pt-4 mb-6">
        <h4 className="text-sm font-medium mb-3">Active Mappings</h4>
        {mappings.length === 0 ? (
          <p className="text-sm text-zinc-500">No project mappings yet.</p>
        ) : (
          <div className="space-y-2">
            {mappings.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between bg-zinc-800 rounded-lg p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="text-zinc-300">{m.sentry_project_slug}</span>
                    <span className="text-zinc-500"> → </span>
                    <span className="text-zinc-300">
                      {forgeProjectName(m.forge_project_id)}
                    </span>
                  </p>
                  {m.last_sync_at && (
                    <p className="text-xs text-zinc-500">
                      Last sync: {new Date(m.last_sync_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteMapping(m.id)}
                  className="shrink-0 p-1 text-zinc-400 hover:text-red-400 transition-colors"
                  title="Remove mapping"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disconnect */}
      <div className="border-t border-zinc-800 pt-4">
        <button
          onClick={handleDisconnect}
          className="w-full px-4 py-2 bg-red-900/20 text-red-400 rounded-lg hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2"
        >
          <Unlink className="w-4 h-4" />
          Disconnect Sentry
        </button>
      </div>
    </div>
  )
}

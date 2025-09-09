"use client"

import { useState, useEffect } from 'react'
import { 
  Link2, 
  Unlink, 
  RefreshCw, 
  Clock, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  Calendar,
  Hash,
  User,
  Crown,
  Activity
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'

interface TodoistSettingsProps {
  userId: string
}

interface SyncStatus {
  connected: boolean
  syncState?: {
    status: string
    lastSyncAt?: string
    nextSyncAt?: string
    errorMessage?: string
    errorCount: number
    consecutiveFailures: number
  }
  syncSettings?: {
    enabled: boolean
    autoSync: boolean
    frequency: number
    isPremium: boolean
  }
  recentSyncs?: any[]
  unresolvedConflicts?: number
}

interface TodoistUser {
  id: string
  email: string
  fullName: string
  isPremium: boolean
  karma: number
}

export function TodoistSettings({ userId }: TodoistSettingsProps) {
  const { showSuccess, showError, showInfo } = useToast()
  const [apiToken, setApiToken] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [todoistUser, setTodoistUser] = useState<TodoistUser | null>(null)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [keepDataOnDisconnect, setKeepDataOnDisconnect] = useState(true)

  useEffect(() => {
    checkSyncStatus()
  }, [userId])

  const checkSyncStatus = async () => {
    try {
      const response = await fetch(`/api/todoist/sync?userId=${userId}`)
      const data = await response.json()
      setSyncStatus(data)
      
      // If connected, get user info from the stored token
      if (data.connected && data.todoistUser) {
        setTodoistUser(data.todoistUser)
      }
    } catch (error) {
      console.error('Failed to check sync status:', error)
    }
  }

  const handleConnect = async () => {
    if (!apiToken.trim()) {
      showError('API Token Required', 'Please enter your Todoist API token')
      return
    }

    setIsConnecting(true)
    try {
      const response = await fetch('/api/todoist/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, userId })
      })

      const result = await response.json()

      if (response.ok) {
        showSuccess('Connected!', `Successfully connected to Todoist as ${result.todoistUser.fullName}`)
        setTodoistUser(result.todoistUser)
        setApiToken('')
        await checkSyncStatus()
        
        // Automatically trigger initial import
        showInfo('Starting Import', 'Importing your Todoist data...')
        await handleSync('full')
      } else {
        showError('Connection Failed', result.error || 'Failed to connect to Todoist')
      }
    } catch (error) {
      showError('Connection Error', 'Failed to connect to Todoist')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleSync = async (syncType: 'full' | 'incremental' = 'incremental') => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/todoist/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, syncType })
      })

      const result = await response.json()

      if (response.ok) {
        const { result: syncResult } = result
        showSuccess(
          'Sync Complete!',
          `Created: ${syncResult.itemsCreated} tasks, ${syncResult.projectsCreated} projects. ` +
          `Updated: ${syncResult.itemsUpdated} tasks, ${syncResult.projectsUpdated} projects.`
        )
        await checkSyncStatus()
      } else {
        showError('Sync Failed', result.error || 'Failed to sync with Todoist')
      }
    } catch (error) {
      showError('Sync Error', 'Failed to sync with Todoist')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const response = await fetch('/api/todoist/connect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, keepData: keepDataOnDisconnect })
      })

      const result = await response.json()

      if (response.ok) {
        showSuccess(
          'Disconnected',
          keepDataOnDisconnect 
            ? 'Disconnected from Todoist. Your data has been preserved.'
            : 'Disconnected from Todoist and removed all synced data.'
        )
        setTodoistUser(null)
        setSyncStatus(null)
        setShowDisconnectConfirm(false)
      } else {
        showError('Disconnect Failed', result.error || 'Failed to disconnect from Todoist')
      }
    } catch (error) {
      showError('Disconnect Error', 'Failed to disconnect from Todoist')
    } finally {
      setIsDisconnecting(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
    
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    
    const days = Math.floor(hours / 24)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }

  const getSyncStatusIcon = () => {
    if (!syncStatus?.syncState) return null
    
    switch (syncStatus.syncState.status) {
      case 'syncing':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />
      default:
        return <Clock className="w-4 h-4 text-zinc-400" />
    }
  }

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800">
      <div className="p-6">
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Todoist Integration
        </h3>
        
        {!syncStatus?.connected ? (
          // Not connected state
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Connect your Todoist account to sync tasks bidirectionally.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Todoist API Token
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Enter your Todoist API token"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  Find your API token in Todoist Settings → Integrations → API token
                </p>
              </div>
              
              <button
                onClick={handleConnect}
                disabled={isConnecting || !apiToken.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-theme-primary text-white rounded-lg hover:bg-theme-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    Connect Todoist
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          // Connected state
          <div className="space-y-4">
            {/* Connection Info */}
            <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                    <Hash className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-white flex items-center gap-2">
                      {todoistUser?.fullName || 'Todoist User'}
                      {todoistUser?.isPremium && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          Premium
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-zinc-400">{todoistUser?.email}</p>
                  </div>
                </div>
                {todoistUser?.karma !== undefined && (
                  <div className="text-right">
                    <p className="text-xs text-zinc-500">Karma</p>
                    <p className="text-lg font-semibold text-theme-primary">{todoistUser.karma}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sync Status */}
            <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getSyncStatusIcon()}
                  <span className="text-sm font-medium">
                    {syncStatus.syncState?.status === 'syncing' ? 'Syncing...' :
                     syncStatus.syncState?.status === 'completed' ? 'Synced' :
                     syncStatus.syncState?.status === 'failed' ? 'Sync Failed' :
                     'Ready to Sync'}
                  </span>
                </div>
                <button
                  onClick={() => handleSync()}
                  disabled={isSyncing || syncStatus.syncState?.status === 'syncing'}
                  className="p-2 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Manual sync"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              <div className="space-y-2 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>Last sync:</span>
                  <span>{formatDate(syncStatus.syncState?.lastSyncAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Next auto-sync:</span>
                  <span>{formatDate(syncStatus.syncState?.nextSyncAt)}</span>
                </div>
                {syncStatus.unresolvedConflicts && syncStatus.unresolvedConflicts > 0 && (
                  <div className="flex justify-between text-yellow-400">
                    <span>Unresolved conflicts:</span>
                    <span>{syncStatus.unresolvedConflicts}</span>
                  </div>
                )}
              </div>
              
              {syncStatus.syncState?.errorMessage && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-400">{syncStatus.syncState.errorMessage}</p>
                </div>
              )}
            </div>

            {/* Sync Settings */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncStatus.syncSettings?.autoSync || false}
                  onChange={async (e) => {
                    // Update auto-sync setting
                    // This would be implemented with an API call
                    showInfo('Coming Soon', 'Auto-sync settings will be available soon')
                  }}
                  className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0"
                />
                <div>
                  <p className="text-white">Auto-sync every {syncStatus.syncSettings?.frequency || 5} minutes</p>
                  <p className="text-xs text-zinc-400">
                    Automatically sync changes between Todoist and Command Center
                  </p>
                </div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-zinc-700">
              <button
                onClick={() => handleSync('full')}
                disabled={isSyncing}
                className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                Full Import
              </button>
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                disabled={isDisconnecting}
                className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full border border-zinc-800">
            <h3 className="text-lg font-semibold mb-4">Disconnect from Todoist?</h3>
            
            <div className="space-y-4 mb-6">
              <p className="text-sm text-zinc-400">
                Choose what to do with your synced Todoist data:
              </p>
              
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={keepDataOnDisconnect}
                  onChange={() => setKeepDataOnDisconnect(true)}
                  className="mt-1 w-4 h-4 text-theme-primary bg-zinc-800 border-zinc-600 focus:ring-theme-primary"
                />
                <div>
                  <p className="text-white font-medium">Keep all data</p>
                  <p className="text-xs text-zinc-400">
                    Preserve all tasks and projects, but remove Todoist connection
                  </p>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={!keepDataOnDisconnect}
                  onChange={() => setKeepDataOnDisconnect(false)}
                  className="mt-1 w-4 h-4 text-theme-primary bg-zinc-800 border-zinc-600 focus:ring-theme-primary"
                />
                <div>
                  <p className="text-white font-medium">Delete synced data</p>
                  <p className="text-xs text-zinc-400">
                    Remove all tasks and projects that came from Todoist
                  </p>
                </div>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isDisconnecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Disconnecting...
                  </span>
                ) : (
                  'Disconnect'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
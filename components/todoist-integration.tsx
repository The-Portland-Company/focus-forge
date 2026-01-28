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
  Activity,
  ChevronDown,
  ChevronUp,
  Database,
  ArrowUpDown,
  Package,
  FileText,
  MessageSquare,
  Tag,
  Folder
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { createClient } from '@/lib/supabase/client'
import { TodoistSyncPreviewModal } from './todoist-sync-preview-modal'

interface TodoistIntegrationProps {
  userId: string
}

interface SyncStats {
  totalProjects: number
  totalTasks: number
  totalSections: number
  totalComments: number
  totalTags: number
  completedTasks: number
  activeTasks: number
  lastSyncDetails?: {
    projectsCreated: number
    projectsUpdated: number
    tasksCreated: number
    tasksUpdated: number
    tasksDeleted: number
    duration: number
  }
}

interface SyncProgress {
  step: string
  progress: number
  total: number
  currentItem: string
  isActive: boolean
}

interface SyncHistory {
  id: string
  syncType: 'full' | 'incremental'
  startedAt: string
  completedAt: string
  itemsCreated: number
  itemsUpdated: number
  itemsDeleted: number
  projectsCreated: number
  projectsUpdated: number
  errors?: string[]
}

export function TodoistIntegration({ userId }: TodoistIntegrationProps) {
  const { showSuccess, showError, showInfo } = useToast()
  const [isConnected, setIsConnected] = useState(false)
  const [apiToken, setApiToken] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null)
  const [syncHistory, setSyncHistory] = useState<SyncHistory[]>([])
  const [todoistProfile, setTodoistProfile] = useState<any>(null)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [nextSyncTime, setNextSyncTime] = useState<string | null>(null)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [syncFrequency, setSyncFrequency] = useState(30)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  useEffect(() => {
    checkConnectionStatus()
  }, [userId])

  const checkConnectionStatus = async () => {
    try {
      const supabase = createClient()
      
      // Get user profile with Todoist settings
      const { data: profile } = await supabase
        .from('profiles')
        .select('todoist_api_token, todoist_sync_enabled, todoist_auto_sync, todoist_sync_frequency, todoist_email, todoist_full_name, todoist_premium, last_todoist_sync')
        .eq('id', userId)
        .single()

      if (profile?.todoist_api_token) {
        setIsConnected(true)
        setAutoSyncEnabled(profile.todoist_auto_sync || false)
        setSyncFrequency(profile.todoist_sync_frequency || 30)
        setLastSyncTime(profile.last_todoist_sync)
        
        setTodoistProfile({
          email: profile.todoist_email,
          fullName: profile.todoist_full_name,
          isPremium: profile.todoist_premium
        })

        // Calculate next sync time
        if (profile.last_todoist_sync && profile.todoist_auto_sync) {
          const lastSync = new Date(profile.last_todoist_sync)
          const nextSync = new Date(lastSync.getTime() + (profile.todoist_sync_frequency || 30) * 60000)
          setNextSyncTime(nextSync.toISOString())
        }

        // Load sync stats
        await loadSyncStats()
        
        // Load sync history
        await loadSyncHistory()
      }
    } catch (error) {
      console.error('Error checking connection status:', error)
    }
  }

  const loadSyncStats = async () => {
    try {
      const supabase = createClient()
      
      // Get counts from database
      const [projects, tasks, sections, comments, tags] = await Promise.all([
        supabase.from('projects').select('id', { count: 'exact' }),
        supabase.from('tasks').select('id, completed', { count: 'exact' }),
        supabase.from('sections').select('id', { count: 'exact' }),
        supabase.from('comments').select('id', { count: 'exact' }),
        supabase.from('tags').select('id', { count: 'exact' })
      ])

      const completedTasks = tasks.data?.filter(t => t.completed).length || 0
      const activeTasks = (tasks.count || 0) - completedTasks

      setSyncStats({
        totalProjects: projects.count || 0,
        totalTasks: tasks.count || 0,
        totalSections: sections.count || 0,
        totalComments: comments.count || 0,
        totalTags: tags.count || 0,
        completedTasks,
        activeTasks
      })
    } catch (error) {
      console.error('Error loading sync stats:', error)
    }
  }

  const loadSyncHistory = async () => {
    try {
      const supabase = createClient()
      
      const { data } = await supabase
        .from('todoist_sync_history')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(10)

      setSyncHistory(data || [])
    } catch (error) {
      console.error('Error loading sync history:', error)
    }
  }

  const handleConnect = async () => {
    const trimmedToken = apiToken.trim()
    if (!trimmedToken) {
      showError('API Token Required', 'Please enter your Todoist API token')
      return
    }

    if (!userId) {
      showError('User Not Found', 'Please refresh the page and try again')
      return
    }

    setIsConnecting(true)
    try {
      const response = await fetch('/api/todoist/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: trimmedToken, userId })
      })

      const result = await response.json()

      if (response.ok) {
        showSuccess('Connected!', `Successfully connected to Todoist as ${result.todoistUser.fullName}`)
        setIsConnected(true)
        setApiToken('')
        await checkConnectionStatus()
        
        // Trigger initial sync
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
    setSyncProgress({
      step: 'Initializing',
      progress: 0,
      total: 100,
      currentItem: 'Starting sync process...',
      isActive: true
    })
    
    const startTime = Date.now()
    
    try {
      // Simulate progress steps
      const progressSteps = [
        { step: 'Connecting to Todoist', progress: 10, item: 'Authenticating with API...' },
        { step: 'Fetching Projects', progress: 25, item: 'Loading project data...' },
        { step: 'Fetching Tasks', progress: 50, item: 'Loading task data...' },
        { step: 'Fetching Comments', progress: 70, item: 'Loading comments...' },
        { step: 'Processing Data', progress: 85, item: 'Saving to database...' },
        { step: 'Finalizing', progress: 95, item: 'Updating sync status...' }
      ]

      // Show progress updates
      for (const progressStep of progressSteps) {
        setSyncProgress({
          step: progressStep.step,
          progress: progressStep.progress,
          total: 100,
          currentItem: progressStep.item,
          isActive: true
        })
        
        // Add small delay to show progress (remove in production or make conditional)
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      const response = await fetch('/api/todoist/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, syncType })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        const duration = Date.now() - startTime
        
        setSyncProgress({
          step: 'Complete',
          progress: 100,
          total: 100,
          currentItem: `Synced ${result.itemsCreated || 0} tasks, ${result.projectsCreated || 0} projects`,
          isActive: false
        })
        
        // Update stats with latest sync details
        setSyncStats(prev => ({
          ...prev!,
          lastSyncDetails: {
            projectsCreated: result.projectsCreated || 0,
            projectsUpdated: result.projectsUpdated || 0,
            tasksCreated: result.itemsCreated || 0,
            tasksUpdated: result.itemsUpdated || 0,
            tasksDeleted: result.itemsDeleted || 0,
            duration
          }
        }))

        showSuccess(
          'Sync Complete!',
          `${syncType === 'full' ? 'Full' : 'Incremental'} sync completed in ${(duration / 1000).toFixed(1)}s`
        )
        
        await checkConnectionStatus()
        
        // Clear progress after 3 seconds
        setTimeout(() => setSyncProgress(null), 3000)
      } else {
        setSyncProgress({
          step: 'Failed',
          progress: 0,
          total: 100,
          currentItem: result.error || 'Sync failed',
          isActive: false
        })
        showError('Sync Failed', result.error || 'Failed to sync with Todoist')
        setTimeout(() => setSyncProgress(null), 5000)
      }
    } catch (error) {
      setSyncProgress({
        step: 'Error',
        progress: 0,
        total: 100,
        currentItem: 'Network error occurred',
        isActive: false
      })
      showError('Sync Error', 'Failed to sync with Todoist')
      setTimeout(() => setSyncProgress(null), 5000)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect from Todoist? Your synced data will be preserved.')) {
      return
    }

    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('profiles')
        .update({
          todoist_api_token: null,
          todoist_sync_enabled: false,
          todoist_auto_sync: false
        })
        .eq('id', userId)

      if (!error) {
        showSuccess('Disconnected', 'Disconnected from Todoist successfully')
        setIsConnected(false)
        setTodoistProfile(null)
        setSyncStats(null)
        setSyncHistory([])
      }
    } catch (error) {
      showError('Error', 'Failed to disconnect from Todoist')
    }
  }

  const toggleAutoSync = async () => {
    try {
      const supabase = createClient()
      const newValue = !autoSyncEnabled
      
      const { error } = await supabase
        .from('profiles')
        .update({ todoist_auto_sync: newValue })
        .eq('id', userId)

      if (!error) {
        setAutoSyncEnabled(newValue)
        showSuccess('Updated', `Auto-sync ${newValue ? 'enabled' : 'disabled'}`)
      }
    } catch (error) {
      showError('Error', 'Failed to update auto-sync setting')
    }
  }

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    
    return date.toLocaleDateString()
  }

  if (!isConnected) {
    return (
      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Package className="w-5 h-5" />
            Todoist Integration
          </h3>
          <span className="text-sm text-zinc-500">Not connected</span>
        </div>
        
        <p className="text-sm text-zinc-400 mb-4">
          Connect your Todoist account to sync tasks and projects bidirectionally.
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">API Token</label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Enter your Todoist API token"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="mt-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-xs font-medium text-zinc-300 mb-1">How to get your API token:</p>
              <ol className="text-xs text-zinc-400 space-y-1 ml-3">
                <li>1. Open Todoist web app or desktop app</li>
                <li>2. Click your avatar (top left) → Settings</li>
                <li>3. Go to "Integrations" tab</li>
                <li>4. Scroll down to "Developer" section</li>
                <li>5. Copy your API token (looks like: 0123456789abcdef...)</li>
              </ol>
              <a 
                href="https://app.todoist.com/app/settings/integrations/developer" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2"
              >
                Open Todoist Settings →
              </a>
            </div>
          </div>
          
          <button
            onClick={handleConnect}
            disabled={isConnecting || !apiToken.trim()}
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
                Connect Todoist
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
          <Package className="w-5 h-5 text-red-500" />
          Todoist Integration
        </h3>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            Connected
          </span>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Account Info */}
      {todoistProfile && (
        <div className="flex items-center justify-between mb-4 p-3 bg-zinc-800 rounded-lg">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-zinc-400" />
            <div>
              <p className="text-sm font-medium">{todoistProfile.fullName}</p>
              <p className="text-xs text-zinc-400">{todoistProfile.email}</p>
            </div>
          </div>
          {todoistProfile.isPremium && (
            <span className="flex items-center gap-1 text-xs bg-amber-900/30 text-amber-400 px-2 py-1 rounded">
              <Crown className="w-3 h-3" />
              Premium
            </span>
          )}
        </div>
      )}

      {/* Sync Preview Modal */}
      <TodoistSyncPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        onConfirm={() => {
          setShowPreviewModal(false)
          handleSync('incremental')
        }}
        userId={userId}
      />

      {/* Sync Controls */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreviewModal(true)}
            disabled={isSyncing}
            className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          <button
            onClick={() => handleSync('full')}
            disabled={isSyncing}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Database className="w-4 h-4" />
            Full Sync
          </button>
        </div>

        {/* Progress Indicator */}
        {syncProgress && (
          <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">{syncProgress.step}</span>
              <span className="text-xs text-zinc-400">{syncProgress.progress}%</span>
            </div>
            
            <div className="w-full bg-zinc-700 rounded-full h-2 mb-3">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${
                  syncProgress.step === 'Failed' || syncProgress.step === 'Error' 
                    ? 'bg-red-500' 
                    : syncProgress.step === 'Complete'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${syncProgress.progress}%` }}
              />
            </div>
            
            <div className="flex items-center gap-2">
              {syncProgress.isActive && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
              <span className="text-xs text-zinc-400">{syncProgress.currentItem}</span>
            </div>
          </div>
        )}

        {/* Auto Sync Toggle */}
        <div className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-zinc-400" />
            <div>
              <p className="text-sm">Auto-sync</p>
              <p className="text-xs text-zinc-400">Every {syncFrequency} minutes</p>
            </div>
          </div>
          <button
            onClick={toggleAutoSync}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoSyncEnabled ? 'bg-blue-600' : 'bg-zinc-600'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              autoSyncEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Last Sync Info */}
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>Last sync: {formatDate(lastSyncTime)}</span>
          {nextSyncTime && autoSyncEnabled && (
            <span>Next sync: {formatDate(nextSyncTime)}</span>
          )}
        </div>
      </div>

      {/* Statistics */}
      {showDetails && syncStats && (
        <div className="space-y-4">
          <div className="border-t border-zinc-800 pt-4">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Sync Statistics
            </h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-zinc-400 mb-1">
                  <Folder className="w-4 h-4" />
                  <span className="text-xs">Projects</span>
                </div>
                <p className="text-xl font-semibold">{syncStats.totalProjects}</p>
              </div>
              
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-zinc-400 mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs">Tasks</span>
                </div>
                <p className="text-xl font-semibold">
                  {syncStats.activeTasks}
                  <span className="text-sm text-zinc-400 ml-1">/ {syncStats.totalTasks}</span>
                </p>
              </div>
              
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-zinc-400 mb-1">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-xs">Comments</span>
                </div>
                <p className="text-xl font-semibold">{syncStats.totalComments}</p>
              </div>
              
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-zinc-400 mb-1">
                  <Tag className="w-4 h-4" />
                  <span className="text-xs">Tags</span>
                </div>
                <p className="text-xl font-semibold">{syncStats.totalTags}</p>
              </div>
            </div>
          </div>

          {/* Sync History */}
          <div className="border-t border-zinc-800 pt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full mb-3"
            >
              <h4 className="text-sm font-medium flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Sync History
              </h4>
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showHistory && syncHistory.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {syncHistory.map((sync) => (
                  <div key={sync.id} className="bg-zinc-800 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {sync.syncType === 'full' ? 'Full Sync' : 'Incremental Sync'}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {formatDate(sync.completedAt || sync.startedAt)}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-zinc-400">
                      <span>+{sync.itemsCreated + sync.projectsCreated} created</span>
                      <span>~{sync.itemsUpdated + sync.projectsUpdated} updated</span>
                      {sync.itemsDeleted > 0 && <span>-{sync.itemsDeleted} deleted</span>}
                    </div>
                    {sync.errors && sync.errors.length > 0 && (
                      <div className="mt-1 text-xs text-red-400">
                        {sync.errors.length} error(s)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disconnect Button */}
          <div className="border-t border-zinc-800 pt-4">
            <button
              onClick={handleDisconnect}
              className="w-full px-4 py-2 bg-red-900/20 text-red-400 rounded-lg hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2"
            >
              <Unlink className="w-4 h-4" />
              Disconnect Todoist
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

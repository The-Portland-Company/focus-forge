"use client"

import { useState } from 'react'
import {
  X,
  Loader2,
  RefreshCw,
  Layers,
  Replace,
  AlertTriangle,
  CheckCircle2,
  Folder,
  CheckSquare
} from 'lucide-react'

interface TodoistQuickSyncModalProps {
  isOpen: boolean
  onClose: () => void
  onSync: (mode: 'merge' | 'overwrite') => Promise<void>
  userId?: string
}

interface SyncProgress {
  status: string
  projectsTotal?: number
  projectsCurrent?: number
  projectName?: string
  tasksTotal?: number
  tasksCurrent?: number
  taskName?: string
  error?: string
  complete?: boolean
  result?: {
    projectsCreated: number
    projectsUpdated: number
    tasksCreated: number
    tasksUpdated: number
    totalErrors: number
  }
}

export function TodoistQuickSyncModal({
  isOpen,
  onClose,
  onSync,
  userId
}: TodoistQuickSyncModalProps) {
  const [syncing, setSyncing] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'merge' | 'overwrite'>('merge')
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  if (!isOpen) return null

  const handleSync = async () => {
    if (!userId) {
      setProgress({ status: 'Error', error: 'User not authenticated' })
      return
    }

    setSyncing(true)
    setProgress({ status: 'Starting sync...' })
    setLogs([])

    try {
      const response = await fetch('/api/todoist/quick-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: userId,
          mode: selectedMode
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Sync failed')
      }

      // Handle SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response stream')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))

              if (data.type === 'status') {
                setProgress(prev => ({ ...prev, status: data.message }))
                setLogs(prev => [...prev, data.message])
              } else if (data.type === 'progress') {
                setProgress(prev => ({
                  ...prev,
                  status: data.message,
                  projectsTotal: data.projectsTotal || prev?.projectsTotal,
                  tasksTotal: data.tasksTotal || prev?.tasksTotal
                }))
                setLogs(prev => [...prev, data.message])
              } else if (data.type === 'project_progress') {
                setProgress(prev => ({
                  ...prev,
                  status: `Syncing project: ${data.name}`,
                  projectsCurrent: data.current,
                  projectsTotal: data.total,
                  projectName: data.name
                }))
              } else if (data.type === 'task_progress') {
                setProgress(prev => ({
                  ...prev,
                  status: `Syncing task: ${data.name}`,
                  tasksCurrent: data.current,
                  tasksTotal: data.total,
                  taskName: data.name
                }))
              } else if (data.type === 'complete') {
                setProgress({
                  status: 'Sync completed!',
                  complete: true,
                  result: data.result
                })
                setLogs(prev => [...prev, data.message])
                // Auto-close after success
                setTimeout(() => {
                  onClose()
                  // Trigger refresh
                  onSync(selectedMode).catch(() => {})
                }, 2000)
              } else if (data.type === 'error') {
                setProgress({ status: 'Error', error: data.message })
                setLogs(prev => [...prev, `Error: ${data.message}`])
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error: any) {
      setProgress({ status: 'Error', error: error.message || 'Sync failed' })
      setLogs(prev => [...prev, `Error: ${error.message}`])
    } finally {
      setSyncing(false)
    }
  }

  const getProjectProgress = () => {
    if (!progress?.projectsTotal) return 0
    return Math.round(((progress.projectsCurrent || 0) / progress.projectsTotal) * 100)
  }

  const getTaskProgress = () => {
    if (!progress?.tasksTotal) return 0
    return Math.round(((progress.tasksCurrent || 0) / progress.tasksTotal) * 100)
  }

  const getOverallProgress = () => {
    if (!progress?.projectsTotal && !progress?.tasksTotal) return 0
    const totalItems = (progress.projectsTotal || 0) + (progress.tasksTotal || 0)
    const completedItems = (progress.projectsCurrent || 0) + (progress.tasksCurrent || 0)
    return Math.round((completedItems / totalItems) * 100)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl w-full max-w-lg border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 text-red-500 ${syncing ? 'animate-spin' : ''}`} />
            Sync with Todoist
          </h2>
          <button
            onClick={onClose}
            disabled={syncing}
            className="p-1 hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {progress?.complete ? (
            // Success state
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 text-green-400">
                <CheckCircle2 className="w-6 h-6" />
                <div>
                  <p className="font-medium">Sync completed!</p>
                  {progress.result && (
                    <p className="text-sm text-green-300 mt-1">
                      {progress.result.projectsCreated + progress.result.projectsUpdated} projects, {' '}
                      {progress.result.tasksCreated + progress.result.tasksUpdated} tasks synced
                    </p>
                  )}
                </div>
              </div>
              {progress.result && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-zinc-400 mb-1">
                      <Folder className="w-4 h-4" />
                      Projects
                    </div>
                    <p className="text-white">
                      <span className="text-green-400">+{progress.result.projectsCreated}</span>
                      {' / '}
                      <span className="text-yellow-400">~{progress.result.projectsUpdated}</span>
                    </p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-zinc-400 mb-1">
                      <CheckSquare className="w-4 h-4" />
                      Tasks
                    </div>
                    <p className="text-white">
                      <span className="text-green-400">+{progress.result.tasksCreated}</span>
                      {' / '}
                      <span className="text-yellow-400">~{progress.result.tasksUpdated}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : progress?.error ? (
            // Error state
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 text-red-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{progress.error}</span>
            </div>
          ) : syncing ? (
            // Syncing state with progress
            <div className="space-y-4">
              {/* Overall progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Overall Progress</span>
                  <span className="text-white font-medium">{getOverallProgress()}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${getOverallProgress()}%` }}
                  />
                </div>
              </div>

              {/* Current status */}
              <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400 flex-shrink-0" />
                <span className="text-sm text-zinc-300 truncate">{progress?.status}</span>
              </div>

              {/* Projects progress */}
              {progress?.projectsTotal && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 flex items-center gap-1">
                      <Folder className="w-3 h-3" />
                      Projects
                    </span>
                    <span className="text-zinc-400">
                      {progress.projectsCurrent || 0} / {progress.projectsTotal}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-150"
                      style={{ width: `${getProjectProgress()}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Tasks progress */}
              {progress?.tasksTotal && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" />
                      Tasks
                    </span>
                    <span className="text-zinc-400">
                      {progress.tasksCurrent || 0} / {progress.tasksTotal}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-150"
                      style={{ width: `${getTaskProgress()}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Activity log */}
              <div className="max-h-32 overflow-y-auto bg-zinc-950 rounded-lg p-2 text-xs font-mono">
                {logs.slice(-10).map((log, i) => (
                  <div key={i} className="text-zinc-500 py-0.5">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Selection state
            <>
              <p className="text-sm text-zinc-400">
                Choose how to handle conflicts between Todoist and local data:
              </p>

              {/* Merge Option */}
              <button
                onClick={() => setSelectedMode('merge')}
                disabled={syncing}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  selectedMode === 'merge'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Layers className={`w-5 h-5 mt-0.5 ${
                    selectedMode === 'merge' ? 'text-blue-400' : 'text-zinc-400'
                  }`} />
                  <div>
                    <h3 className={`font-medium ${
                      selectedMode === 'merge' ? 'text-blue-400' : 'text-white'
                    }`}>
                      Merge (Recommended)
                    </h3>
                    <p className="text-sm text-zinc-400 mt-1">
                      Combine Todoist tasks with local tasks. New tasks from Todoist will be added,
                      existing tasks will be updated if changed in Todoist.
                    </p>
                  </div>
                </div>
              </button>

              {/* Overwrite Option */}
              <button
                onClick={() => setSelectedMode('overwrite')}
                disabled={syncing}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  selectedMode === 'overwrite'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Replace className={`w-5 h-5 mt-0.5 ${
                    selectedMode === 'overwrite' ? 'text-orange-400' : 'text-zinc-400'
                  }`} />
                  <div>
                    <h3 className={`font-medium ${
                      selectedMode === 'overwrite' ? 'text-orange-400' : 'text-white'
                    }`}>
                      Overwrite
                    </h3>
                    <p className="text-sm text-zinc-400 mt-1">
                      Replace all synced tasks with Todoist data. Local changes to Todoist tasks
                      will be lost. Local-only tasks are preserved.
                    </p>
                  </div>
                </div>
              </button>

              {selectedMode === 'overwrite' && (
                <div className="flex items-start gap-2 p-3 bg-orange-500/10 rounded-lg text-orange-400 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Warning: This will overwrite any local changes you&apos;ve made to tasks that came from Todoist.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!progress?.complete && !syncing && (
          <div className="p-4 border-t border-zinc-800 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={syncing}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2 ${
                selectedMode === 'overwrite'
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              Sync Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

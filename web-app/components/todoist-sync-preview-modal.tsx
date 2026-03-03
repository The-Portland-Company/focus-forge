"use client"

import { useState, useEffect } from 'react'
import {
  X,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  ArrowRight,
  CheckCircle2,
  Folder,
  CheckSquare,
  AlertCircle
} from 'lucide-react'

interface SyncPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  userId: string
}

interface PreviewData {
  todoist: {
    projectCount: number
    taskCount: number
  }
  local: {
    projectCount: number
    taskCount: number
  }
  changes: {
    projects: {
      new: any[]
      updated: any[]
      unchanged: any[]
      deleted: any[]
    }
    tasks: {
      new: any[]
      updated: any[]
      unchanged: any[]
      deleted: any[]
    }
  }
  summary: {
    newProjects: number
    updatedProjects: number
    deletedProjects: number
    newTasks: number
    updatedTasks: number
    deletedTasks: number
  }
}

export function TodoistSyncPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  userId
}: SyncPreviewModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [activeTab, setActiveTab] = useState<'projects' | 'tasks'>('tasks')

  useEffect(() => {
    if (isOpen) {
      fetchPreview()
    }
  }, [isOpen, userId])

  const fetchPreview = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/todoist/preview?userId=${userId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch preview')
      }

      setPreview(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const hasChanges = preview && (
    preview.summary.newProjects > 0 ||
    preview.summary.updatedProjects > 0 ||
    preview.summary.deletedProjects > 0 ||
    preview.summary.newTasks > 0 ||
    preview.summary.updatedTasks > 0 ||
    preview.summary.deletedTasks > 0
  )

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            Sync Preview
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <span className="ml-3 text-zinc-400">Comparing data...</span>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-red-400 p-6">
              <AlertCircle className="w-8 h-8 mb-3" />
              <p className="text-center mb-2">{error}</p>
              {error.includes('invalid') || error.includes('expired') || error.includes('reconnect') ? (
                <p className="text-sm text-zinc-400 text-center">
                  Go to Todoist Settings → Integrations → Developer to get a new token
                </p>
              ) : null}
            </div>
          ) : preview ? (
            <>
              {/* Summary Bar */}
              <div className="p-4 bg-zinc-800/50 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400">Todoist:</span>
                      <span className="font-medium">{preview.todoist.projectCount} projects, {preview.todoist.taskCount} tasks</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600" />
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400">Local:</span>
                      <span className="font-medium">{preview.local.projectCount} projects, {preview.local.taskCount} tasks</span>
                    </div>
                  </div>
                </div>

                {/* Change Summary */}
                <div className="flex gap-4 mt-3">
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <Plus className="w-4 h-4" />
                    {preview.summary.newProjects + preview.summary.newTasks} new
                  </span>
                  <span className="flex items-center gap-1 text-sm text-yellow-400">
                    <RefreshCw className="w-4 h-4" />
                    {preview.summary.updatedProjects + preview.summary.updatedTasks} updated
                  </span>
                  <span className="flex items-center gap-1 text-sm text-red-400">
                    <Trash2 className="w-4 h-4" />
                    {preview.summary.deletedProjects + preview.summary.deletedTasks} removed
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-zinc-800">
                <button
                  onClick={() => setActiveTab('tasks')}
                  className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                    activeTab === 'tasks'
                      ? 'border-b-2 border-blue-500 text-blue-400'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                  Tasks
                  {(preview.summary.newTasks + preview.summary.updatedTasks + preview.summary.deletedTasks) > 0 && (
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full text-xs">
                      {preview.summary.newTasks + preview.summary.updatedTasks + preview.summary.deletedTasks}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('projects')}
                  className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                    activeTab === 'projects'
                      ? 'border-b-2 border-blue-500 text-blue-400'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Folder className="w-4 h-4" />
                  Projects
                  {(preview.summary.newProjects + preview.summary.updatedProjects + preview.summary.deletedProjects) > 0 && (
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full text-xs">
                      {preview.summary.newProjects + preview.summary.updatedProjects + preview.summary.deletedProjects}
                    </span>
                  )}
                </button>
              </div>

              {/* Changes List */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'tasks' ? (
                  <ChangesList changes={preview.changes.tasks} type="task" />
                ) : (
                  <ChangesList changes={preview.changes.projects} type="project" />
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={fetchPreview}
            disabled={loading}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || !hasChanges}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {hasChanges ? 'Sync Now' : 'No Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChangesList({
  changes,
  type
}: {
  changes: { new: any[]; updated: any[]; unchanged: any[]; deleted: any[] }
  type: 'task' | 'project'
}) {
  const totalChanges = changes.new.length + changes.updated.length + changes.deleted.length

  if (totalChanges === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
        <p>All {type}s are in sync</p>
        <p className="text-sm mt-1">{changes.unchanged.length} {type}s unchanged</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* New Items */}
      {changes.new.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-green-400 flex items-center gap-2 mb-2">
            <Plus className="w-4 h-4" />
            New from Todoist ({changes.new.length})
          </h4>
          <div className="space-y-1">
            {changes.new.slice(0, 10).map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 bg-green-500/10 rounded-lg border border-green-500/20"
              >
                <Plus className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-sm truncate">{item.name}</span>
              </div>
            ))}
            {changes.new.length > 10 && (
              <p className="text-xs text-zinc-500 pl-2">
                +{changes.new.length - 10} more...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Updated Items */}
      {changes.updated.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-yellow-400 flex items-center gap-2 mb-2">
            <RefreshCw className="w-4 h-4" />
            Updated ({changes.updated.length})
          </h4>
          <div className="space-y-1">
            {changes.updated.slice(0, 10).map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20"
              >
                <RefreshCw className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm truncate block">{item.name}</span>
                  {item.localName && item.localName !== item.name && (
                    <span className="text-xs text-zinc-500 truncate block">
                      was: {item.localName}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {changes.updated.length > 10 && (
              <p className="text-xs text-zinc-500 pl-2">
                +{changes.updated.length - 10} more...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Deleted Items */}
      {changes.deleted.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-400 flex items-center gap-2 mb-2">
            <Trash2 className="w-4 h-4" />
            Removed from Todoist ({changes.deleted.length})
          </h4>
          <div className="space-y-1">
            {changes.deleted.slice(0, 10).map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 bg-red-500/10 rounded-lg border border-red-500/20"
              >
                <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-sm truncate text-zinc-400 line-through">{item.name}</span>
              </div>
            ))}
            {changes.deleted.length > 10 && (
              <p className="text-xs text-zinc-500 pl-2">
                +{changes.deleted.length - 10} more...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Unchanged count */}
      {changes.unchanged.length > 0 && (
        <p className="text-xs text-zinc-500 text-center pt-4 border-t border-zinc-800">
          {changes.unchanged.length} {type}s unchanged
        </p>
      )}
    </div>
  )
}

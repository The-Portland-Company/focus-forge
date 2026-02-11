"use client"

import { useState, useEffect } from 'react'
import { Task, Project } from '@/lib/types'
import { Circle, CheckCircle2, Calendar, CalendarX2, Flag, Trash2, Edit, ChevronRight, ChevronDown, Link2, AlertCircle, Repeat2, Hash, Square, CheckSquare, Loader2, FileText, MessageCircle } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { getStartOfDay, isToday, isOverdue } from '@/lib/date-utils'
import { formatRecurringLabel } from '@/lib/recurring-utils'
import { isTaskBlocked, getBlockingTasks } from '@/lib/dependency-utils'
import { UserAvatar } from '@/components/user-avatar'
import * as Popover from '@radix-ui/react-popover'

interface TaskListProps {
  tasks: Task[]
  allTasks?: Task[] // For dependency checking
  projects?: Project[] // For showing project names
  currentUserId?: string // For hiding "me" avatar
  priorityColor?: string // User's custom priority color (defaults to green)
  showCompleted?: boolean
  completedAccordionKey?: string // localStorage key for persisting completed state
  revealActionsOnHover?: boolean
  uniformDueBadgeWidth?: boolean
  bulkSelectMode?: boolean
  selectedTaskIds?: Set<string>
  loadingTaskIds?: Set<string> // Tasks currently being processed
  animatingOutTaskIds?: Set<string> // Tasks animating out after processing
  optimisticCompletedIds?: Set<string> // Tasks optimistically marked as completed
  enableDueDateQuickEdit?: boolean
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void> | void
  onTaskToggle: (taskId: string) => void
  onTaskEdit: (task: Task) => void
  onTaskDelete: (taskId: string) => void
  onTaskSelect?: (taskId: string, event?: React.MouseEvent) => void
}

// Default priority colors - shades of red (brighter = higher priority)
const getDefaultPriorityColors = () => ({
  1: '#ef4444', // red-500 - brightest (highest priority)
  2: '#f87171', // red-400
  3: '#fca5a5', // red-300
  4: '#fecaca'  // red-200 - lightest (lowest priority)
})

// Generate priority colors based on a base hue
const generatePriorityColors = (baseColor: string) => {
  // If it's a hex color, use it to generate shades
  if (baseColor.startsWith('#')) {
    // Convert hex to HSL to generate shades
    const hex = baseColor.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }

    // Generate 4 shades with same hue, varying saturation and lightness
    const hslToHex = (h: number, s: number, l: number) => {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1/6) return p + (q - p) * 6 * t
        if (t < 1/2) return q
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
        return p
      }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      const r = Math.round(hue2rgb(p, q, h + 1/3) * 255)
      const g = Math.round(hue2rgb(p, q, h) * 255)
      const b = Math.round(hue2rgb(p, q, h - 1/3) * 255)
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    }

    return {
      1: hslToHex(h, Math.min(s * 1.2, 1), 0.45), // brightest (highest priority)
      2: hslToHex(h, s, 0.55),
      3: hslToHex(h, s * 0.8, 0.65),
      4: hslToHex(h, s * 0.6, 0.75)  // lightest (lowest priority)
    }
  }
  return getDefaultPriorityColors()
}

// Overdue colors - graduated shades of red (darker = more overdue)
const getOverdueColor = (dueDate: string) => {
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))

  if (daysOverdue <= 0) return null // Not overdue
  if (daysOverdue === 1) return '#fca5a5' // red-300 - lightest
  if (daysOverdue === 2) return '#f87171' // red-400
  if (daysOverdue === 3) return '#ef4444' // red-500
  if (daysOverdue <= 7) return '#dc2626' // red-600
  if (daysOverdue <= 14) return '#b91c1c' // red-700
  if (daysOverdue <= 21) return '#991b1b' // red-800
  return '#7f1d1d' // red-900 - darkest (4+ weeks)
}

export function TaskList({ tasks, allTasks, projects, currentUserId, priorityColor, showCompleted = false, completedAccordionKey, revealActionsOnHover = false, uniformDueBadgeWidth = false, bulkSelectMode = false, selectedTaskIds, loadingTaskIds, animatingOutTaskIds, optimisticCompletedIds, enableDueDateQuickEdit, onTaskUpdate, onTaskToggle, onTaskEdit, onTaskDelete, onTaskSelect }: TaskListProps) {
  // Generate priority colors based on user preference or default to green
  const priorityColors = priorityColor ? generatePriorityColors(priorityColor) : getDefaultPriorityColors()
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)
  const [showCompletedTasks, setShowCompletedTasks] = useState(showCompleted)
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
  const [hasLoadedCompletedState, setHasLoadedCompletedState] = useState(false)
  const [quickEditTaskId, setQuickEditTaskId] = useState<string | null>(null)
  const [quickDueDate, setQuickDueDate] = useState('')
  const [quickDueTime, setQuickDueTime] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)

  // Load completed accordion state from localStorage
  useEffect(() => {
    if (completedAccordionKey && !hasLoadedCompletedState) {
      const saved = localStorage.getItem(`completedAccordion_${completedAccordionKey}`)
      if (saved !== null) {
        setShowCompletedTasks(saved === 'true')
      }
      setHasLoadedCompletedState(true)
    }
  }, [completedAccordionKey, hasLoadedCompletedState])

  // Save completed accordion state to localStorage
  useEffect(() => {
    if (completedAccordionKey && hasLoadedCompletedState) {
      localStorage.setItem(`completedAccordion_${completedAccordionKey}`, showCompletedTasks.toString())
    }
  }, [showCompletedTasks, completedAccordionKey, hasLoadedCompletedState])

  // Helper to get project acronym
  const getProjectAcronym = (name: string) => {
    const words = name.split(/\s+/)
    if (words.length === 1) {
      return name.substring(0, 2).toUpperCase()
    }
    return words.map(word => word.charAt(0)).join('').toUpperCase().substring(0, 3)
  }

  const copyTaskId = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(taskId)
      setCopiedTaskId(taskId)
      setTimeout(() => setCopiedTaskId(null), 1500)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getRecurringTooltip = (pattern: string) => {
    return formatRecurringLabel(pattern)
  }

  const activeTasks = tasks.filter(task => !task.completed)
  const completedTasks = tasks.filter(task => task.completed)

  const sortTasks = (tasksToSort: Task[]) => {
    return [...tasksToSort].sort((a, b) => {
      // By priority (1 is highest)
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }
      // Then by due date
      const aDueDate = (a as any).due_date ?? a.dueDate
      const bDueDate = (b as any).due_date ?? b.dueDate
      if (aDueDate && bDueDate) {
        return new Date(aDueDate).getTime() - new Date(bDueDate).getTime()
      }
      return 0
    })
  }

  // Organize tasks hierarchically
  const organizeTasksHierarchically = (tasksToOrganize: Task[]): Task[] => {
    const taskMap = new Map(tasksToOrganize.map(task => [task.id, task]))
    const rootTasks: Task[] = []
    const sortedTasks: Task[] = []
    
    // First, identify root tasks (no parent)
    tasksToOrganize.forEach(task => {
      if (!task.parentId || !taskMap.has(task.parentId)) {
        rootTasks.push(task)
      }
    })
    
    // Sort root tasks
    const sortedRoots = sortTasks(rootTasks)
    
    // Build hierarchical structure
    const addTaskWithChildren = (task: Task) => {
      sortedTasks.push(task)
      
      // Skip children if task is collapsed
      if (!collapsedTasks.has(task.id)) {
        // Find and add children
        const children = tasksToOrganize.filter(t => t.parentId === task.id)
        sortTasks(children).forEach(child => {
          addTaskWithChildren(child)
        })
      }
    }
    
    sortedRoots.forEach(task => {
      addTaskWithChildren(task)
    })
    
    return sortedTasks
  }

  const sortedActiveTasks = organizeTasksHierarchically(activeTasks)
  const sortedCompletedTasks = organizeTasksHierarchically(completedTasks)

  const formatFullDueDate = (date: string, time?: string, forceTime = false) => {
    const hasTimeInDate = date.includes('T')
    const dateOnly = hasTimeInDate ? date.split('T')[0] : date
    const normalizedTime = time ? (time.length === 5 ? `${time}:00` : time) : null
    const hasTime = forceTime || !!normalizedTime || hasTimeInDate
    const dateTime = normalizedTime
      ? `${dateOnly}T${normalizedTime}`
      : hasTimeInDate
      ? date
      : `${dateOnly}T00:00:00`

    const parsed = new Date(dateTime)
    if (Number.isNaN(parsed.getTime())) {
      const fallback = getStartOfDay(dateOnly)
      const month = `${format(fallback, 'MMM')}.`
      const day = format(fallback, 'do')
      const year = `'${format(fallback, 'yy')}`
      const timePart = forceTime ? ` ${format(fallback, 'h:mm a')}` : ''
      return `${month} ${day} ${year}${timePart}`
    }

    const month = `${format(parsed, 'MMM')}.`
    const day = format(parsed, 'do')
    const year = `'${format(parsed, 'yy')}`
    const timePart = hasTime ? ` ${format(parsed, 'h:mm a')}` : ''
    return `${month} ${day} ${year}${timePart}`
  }

  // Returns badge styling for due date
  const getDueDateStyle = (date: string): { className: string } => {
    // Handle both YYYY-MM-DD and ISO timestamp formats
    const dateOnly = date.includes('T') ? date.split('T')[0] : date
    const overdueColor = getOverdueColor(dateOnly)
    if (overdueColor) {
      return { className: 'bg-red-500/20 text-red-200 border border-red-500/30' }
    } else if (isToday(dateOnly)) {
      return { className: 'bg-orange-500/20 text-orange-200 border border-orange-500/30' }
    }
    return { className: 'bg-zinc-800 text-zinc-300 border border-zinc-700' }
  }

  const hasChildren = (taskId: string) => {
    return tasks.some(t => t.parentId === taskId)
  }

  const quickDateOptions = [
    { label: 'Today', date: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', date: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: 'Next Week', date: format(addDays(new Date(), 7), 'yyyy-MM-dd') }
  ]

  const openQuickEditor = (task: Task) => {
    const dueDate = (task as any).due_date || task.dueDate || ''
    const dueTime = (task as any).due_time || task.dueTime || ''
    setQuickDueDate(dueDate || '')
    setQuickDueTime(dueTime || '')
    setQuickEditTaskId(task.id)
  }

  const applyQuickDueDate = async (task: Task) => {
    if (!onTaskUpdate) return
    setQuickSaving(true)
    try {
      const nextDueDate = quickDueDate || null
      const nextDueTime = quickDueDate ? (quickDueTime || null) : null
      const updates: Record<string, any> = {
        due_date: nextDueDate,
        due_time: nextDueTime
      }
      await onTaskUpdate(task.id, updates as any)
      setQuickEditTaskId(null)
    } catch (error) {
      console.error('Error updating due date:', error)
    } finally {
      setQuickSaving(false)
    }
  }

  const getIndentLevel = (task: Task): number => {
    let level = 0
    let currentTask = task
    while (currentTask.parentId) {
      level++
      currentTask = tasks.find(t => t.id === currentTask.parentId) || currentTask
      if (currentTask.id === task.id) break // Prevent infinite loop
    }
    return level
  }

  const renderTask = (task: Task) => {
    const indentLevel = getIndentLevel(task)
    const hasSubtasks = hasChildren(task.id)
    const isCollapsed = collapsedTasks.has(task.id)
    const isLoading = loadingTaskIds?.has(task.id)
    const isAnimatingOut = animatingOutTaskIds?.has(task.id)
    const isOptimisticCompleted = optimisticCompletedIds?.has(task.id)
    const isCompleted = task.completed || isOptimisticCompleted
    const dueDate = (task as any).due_date || task.dueDate
    const dueDateOnly = dueDate ? (dueDate.includes('T') ? dueDate.split('T')[0] : dueDate) : null
    const isDueToday = !!(dueDateOnly && isToday(dueDateOnly))
    const isBlocked = !!(allTasks && isTaskBlocked(task, allTasks))
    const showHoverActions = !revealActionsOnHover || hoveredTask === task.id
    const actionVisibilityClass = showHoverActions
      ? 'opacity-100 pointer-events-auto'
      : 'opacity-0 pointer-events-none'

    return (
    <div
      key={task.id}
      draggable={!isLoading && !isAnimatingOut}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('taskId', task.id)
      }}
      className={`group relative flex items-start gap-3 px-4 py-1 rounded-lg hover:bg-zinc-800/50 transition-all cursor-move ${
        isCompleted ? 'opacity-50' : ''
      } ${isAnimatingOut ? 'animate-slide-fade-out' : ''} ${isOptimisticCompleted && !isAnimatingOut ? 'gradient-strikethrough' : ''} ${isLoading ? 'opacity-70' : ''}`}
      style={{ paddingLeft: `${16 + indentLevel * 24}px` }}
      onMouseEnter={() => setHoveredTask(task.id)}
      onMouseLeave={() => setHoveredTask(null)}
    >
      {bulkSelectMode && onTaskSelect && (
        isLoading ? (
          <Loader2 className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))] animate-spin mr-1" />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTaskSelect(task.id, e)
            }}
            className="text-zinc-400 hover:text-[rgb(var(--theme-primary-rgb))] transition-colors mr-1"
            disabled={isAnimatingOut}
          >
            {selectedTaskIds?.has(task.id) ? (
              <CheckSquare className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))]" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
        )
      )}

      {hasSubtasks && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setCollapsedTasks(prev => {
              const next = new Set(prev)
              if (next.has(task.id)) {
                next.delete(task.id)
              } else {
                next.add(task.id)
              }
              return next
            })
          }}
          className="text-zinc-400 hover:text-zinc-300 transition-colors mr-1"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      )}
      
      <button
        onClick={() => {
          if (!isBlocked) {
            onTaskToggle(task.id)
          }
        }}
        className={`mt-0.5 transition-colors ${
          isCompleted
            ? 'text-zinc-400'
            : isBlocked
            ? 'text-zinc-500 cursor-not-allowed'
            : isDueToday
            ? 'text-zinc-400'
            : ''
        }`}
        style={!isCompleted && !isBlocked && !isDueToday ? { color: priorityColors[task.priority] } : undefined}
        disabled={isBlocked || isOptimisticCompleted}
        title={isBlocked ? 'Complete dependencies first' : ''}
      >
        {isCompleted ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : allTasks && isTaskBlocked(task, allTasks) ? (
          <AlertCircle className="w-5 h-5" />
        ) : (
          <Circle className="w-5 h-5" />
        )}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onTaskEdit(task)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 min-w-0">
              {(() => {
                const dueDate = (task as any).due_date || task.dueDate
                const dueTime = (task as any).due_time || task.dueTime
                if (!dueDate) return null
                const dateStyle = getDueDateStyle(dueDate)
                const formatted = formatFullDueDate(dueDate, dueTime || undefined, true)
                const uniformBadgeClass = uniformDueBadgeWidth ? 'min-w-[132px] justify-center' : ''
                if (!enableDueDateQuickEdit || !onTaskUpdate) {
                  return (
                    <span
                      className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${uniformBadgeClass} ${dateStyle.className}`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="whitespace-nowrap">{formatted}</span>
                    </span>
                  )
                }

                const isOpen = quickEditTaskId === task.id

                return (
                  <Popover.Root
                    open={isOpen}
                    onOpenChange={(open) => {
                      if (open) {
                        openQuickEditor(task)
                      } else if (quickEditTaskId === task.id) {
                        setQuickEditTaskId(null)
                      }
                    }}
                  >
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${uniformBadgeClass} ${dateStyle.className}`}
                        aria-label="Edit due date"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="whitespace-nowrap">{formatted}</span>
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        side="bottom"
                        align="start"
                        sideOffset={8}
                        className="z-50 w-64 rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-zinc-300">Due date</span>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickDueDate('')
                                setQuickDueTime('')
                              }}
                              className="text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              Clear
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {quickDateOptions.map(option => (
                              <button
                                key={option.label}
                                type="button"
                                onClick={() => setQuickDueDate(option.date)}
                                className={`px-2 py-1 rounded text-xs border transition-colors ${
                                  quickDueDate === option.date
                                    ? 'bg-[rgb(var(--theme-primary-rgb))]/20 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/40'
                                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[11px] text-zinc-500">
                              Date
                              <input
                                type="date"
                                value={quickDueDate}
                                onChange={(e) => setQuickDueDate(e.target.value)}
                                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white themed-date-input"
                              />
                            </label>
                            <label className="text-[11px] text-zinc-500">
                              Time
                              <input
                                type="time"
                                value={quickDueTime}
                                onChange={(e) => setQuickDueTime(e.target.value)}
                                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white themed-date-input"
                              />
                            </label>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setQuickEditTaskId(null)}
                              className="text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => applyQuickDueDate(task)}
                              disabled={quickSaving}
                              className="px-2 py-1 text-xs rounded bg-[rgb(var(--theme-primary-rgb))] text-white hover:bg-[rgb(var(--theme-primary-rgb))]/80 disabled:opacity-60"
                            >
                              {quickSaving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                        <Popover.Arrow className="fill-zinc-900 stroke-zinc-800" width={10} height={6} />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                )
              })()}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <p className={`text-sm truncate group-hover:whitespace-normal group-hover:text-clip transition-all ${
                  isCompleted ? 'line-through text-zinc-500' :
                  allTasks && isTaskBlocked(task, allTasks) ? 'text-zinc-400' : 'text-white'
                }`}>
                  {task.name}
                </p>
                {task.description && (
                  <div className="text-xs text-zinc-500 line-clamp-2 text-left">
                    {task.description}
                  </div>
                )}
              </div>
              {allTasks && isTaskBlocked(task, allTasks) && !isCompleted && (
                <div className="flex items-center gap-1 text-[rgb(var(--theme-primary-rgb))] flex-shrink-0" title="Task is blocked by dependencies">
                  <Link2 className="w-3 h-3" />
                  <span className="text-xs">Blocked</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center text-xs flex-shrink-0">
            <div className="flex items-center gap-2">
              {task.todoistId ? (
                <span className={`relative group/todoist flex items-center justify-center w-4 transition-opacity ${actionVisibilityClass}`}>
                  <span className="text-[10px] text-zinc-500 font-bold">T</span>
                  <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/todoist:opacity-100 transition-opacity pointer-events-none z-50">
                    Synced from Todoist
                  </span>
                </span>
              ) : null}

              {/* Recurring - first position */}
              {task.recurringPattern ? (
                <span className="relative group/recurring flex items-center justify-center w-4">
                  <Repeat2 className="w-4 h-4 text-purple-400" />
                  <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/recurring:opacity-100 transition-opacity pointer-events-none z-50">
                    {getRecurringTooltip(task.recurringPattern)}
                  </span>
                </span>
              ) : null}

              {task.assignedToName && (!currentUserId || (task as any).assigned_to !== currentUserId) ? (
                <span className="relative group/assignee flex items-center justify-center w-4">
                  <UserAvatar
                    name={(task as any).assignedToName}
                    profileColor={(task as any).assignedToColor}
                    memoji={(task as any).assignedToMemoji}
                    size={16}
                    className="text-[9px] font-medium"
                  />
                  <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/assignee:opacity-100 transition-opacity pointer-events-none z-50">
                    {task.assignedToName}
                  </span>
                </span>
              ) : null}

              {projects && (() => {
                const projectId = (task as any).project_id || task.projectId
                if (!projectId) return null
                const project = projects.find(p => p.id === projectId)
                return project ? (
                  <span className="relative group/project flex items-center justify-center w-4">
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[6px] font-bold text-white"
                      style={{ backgroundColor: project.color }}
                    >
                      {getProjectAcronym(project.name)}
                    </span>
                    <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/project:opacity-100 transition-opacity pointer-events-none z-50">
                      {project.name}
                    </span>
                  </span>
                ) : null
              })()}

              {task.deadline ? (
                <span className="relative group/deadline flex items-center justify-center w-4 text-red-400">
                  <Flag className="w-4 h-4" />
                  <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/deadline:opacity-100 transition-opacity pointer-events-none z-50">
                    Deadline: {formatFullDueDate(task.deadline)}
                  </span>
                </span>
              ) : null}

              {/* Comments indicator */}
              {((task as any).todoistCommentCount > 0 || (task as any).commentCount > 0) ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onTaskEdit(task)
                  }}
                  className="relative group/comments flex items-center justify-center w-4"
                >
                  <MessageCircle className="w-4 h-4 text-blue-400" />
                  <span className="absolute -top-1 -right-1 min-w-[12px] h-3 bg-blue-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {(task as any).todoistCommentCount || (task as any).commentCount}
                  </span>
                  <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/comments:opacity-100 transition-opacity pointer-events-none z-50">
                    {(task as any).todoistCommentCount || (task as any).commentCount} comment{((task as any).todoistCommentCount || (task as any).commentCount) !== 1 ? 's' : ''}
                  </span>
                </button>
              ) : null}

              {!isCompleted ? (
                <span className="relative group/priority flex items-center justify-center w-4">
                  <Flag className="w-4 h-4" style={{ color: priorityColors[task.priority] }} />
                  <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/priority:opacity-100 transition-opacity pointer-events-none z-50">
                    Priority {task.priority}
                  </span>
                </span>
              ) : null}
            </div>

            <div
              className={`flex items-center gap-3 overflow-hidden transition-[max-width,opacity,transform,margin] duration-200 ease-out ${
                showHoverActions
                  ? 'ml-3 max-w-[150px] opacity-100 translate-x-0 pointer-events-auto'
                  : 'ml-0 max-w-0 opacity-0 translate-x-2 pointer-events-none'
              }`}
            >
              {((task as any).due_date || task.dueDate) && onTaskUpdate ? (
                <div className="relative group/removedate flex items-center justify-center w-4">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      await onTaskUpdate(task.id, { due_date: null, due_time: null } as any)
                    }}
                    className="text-zinc-600 hover:text-orange-400 transition-colors"
                  >
                    <CalendarX2 className="w-4 h-4" />
                  </button>
                  <span className="absolute right-0 top-full mt-1 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/removedate:opacity-100 transition-opacity pointer-events-none z-50">
                    Remove date
                  </span>
                </div>
              ) : null}

              <div className="relative group/taskid flex items-center justify-center w-4">
                <button
                  onClick={(e) => copyTaskId(task.id, e)}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <Hash className="w-4 h-4" />
                </button>
                <span className="absolute right-0 top-full mt-1 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/taskid:opacity-100 transition-opacity pointer-events-none z-50">
                  {task.id.slice(0, 8)}
                </span>
                {copiedTaskId === task.id && (
                  <span className="absolute right-0 top-full mt-1 text-[10px] text-green-400 font-medium whitespace-nowrap animate-fade-in-up z-50">
                    Copied!
                  </span>
                )}
              </div>

              <div className="relative group/edit flex items-center justify-center w-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onTaskEdit(task)
                  }}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <span className="absolute right-0 top-full mt-1 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/edit:opacity-100 transition-opacity pointer-events-none z-50">
                  Edit
                </span>
              </div>

              <div className="relative group/delete flex items-center justify-center w-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onTaskDelete(task.id)
                  }}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <span className="absolute right-0 top-full mt-1 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/delete:opacity-100 transition-opacity pointer-events-none z-50">
                  Delete
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    )
  }

  return (
    <div className="py-4">
      {sortedActiveTasks.map(renderTask)}
      
      {sortedActiveTasks.length === 0 && completedTasks.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          <p>No tasks to display</p>
        </div>
      )}
      
      {completedTasks.length > 0 && (
        <div className="mt-8 border-t border-zinc-800 pt-4">
          <button
            onClick={() => setShowCompletedTasks(!showCompletedTasks)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            {showCompletedTasks ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Completed ({completedTasks.length})
          </button>
          
          {showCompletedTasks && (
            <div className="mt-2">
              {sortedCompletedTasks.map(renderTask)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

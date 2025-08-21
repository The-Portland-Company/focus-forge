"use client"

import { useState } from 'react'
import { Task } from '@/lib/types'
import { Circle, CheckCircle2, Calendar, Flag, MoreHorizontal, Trash2, Edit, User, ChevronRight, ChevronDown, Link2, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { getStartOfDay, isToday, isOverdue } from '@/lib/date-utils'
import { isTaskBlocked, getBlockingTasks } from '@/lib/dependency-utils'

interface TaskListProps {
  tasks: Task[]
  allTasks?: Task[] // For dependency checking
  showCompleted?: boolean
  onTaskToggle: (taskId: string) => void
  onTaskEdit: (task: Task) => void
  onTaskDelete: (taskId: string) => void
}

const priorityColors = {
  1: 'text-red-500',
  2: 'text-[rgb(var(--theme-primary-rgb))]', 
  3: 'text-blue-500',
  4: 'text-[rgb(var(--theme-primary-rgb))]'
}

export function TaskList({ tasks, allTasks, showCompleted = false, onTaskToggle, onTaskEdit, onTaskDelete }: TaskListProps) {
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)
  const [menuOpenTask, setMenuOpenTask] = useState<string | null>(null)
  const [showCompletedTasks, setShowCompletedTasks] = useState(showCompleted)
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())

  const activeTasks = tasks.filter(task => !task.completed)
  const completedTasks = tasks.filter(task => task.completed)

  const sortTasks = (tasksToSort: Task[]) => {
    return [...tasksToSort].sort((a, b) => {
      // By priority (1 is highest)
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }
      // Then by due date
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
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

  const formatDueDate = (date: string) => {
    const taskDate = getStartOfDay(date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    if (isToday(date)) {
      return 'Today'
    } else if (taskDate.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    } else if (isOverdue(date)) {
      return format(taskDate, 'MMM d') + ' (Overdue)'
    } else {
      return format(taskDate, 'MMM d')
    }
  }

  const getDueDateColor = (date: string) => {
    if (isOverdue(date)) {
      return 'text-red-500'
    } else if (isToday(date)) {
      return 'text-green-500'
    }
    return 'text-zinc-400'
  }

  const hasChildren = (taskId: string) => {
    return tasks.some(t => t.parentId === taskId)
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
    
    return (
    <div
      key={task.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('taskId', task.id)
      }}
      className={`group relative flex items-start gap-3 px-4 py-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-move ${
        task.completed ? 'opacity-50' : ''
      }`}
      style={{ paddingLeft: `${16 + indentLevel * 24}px` }}
      onMouseEnter={() => setHoveredTask(task.id)}
      onMouseLeave={() => setHoveredTask(null)}
    >
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
          if (!allTasks || !isTaskBlocked(task, allTasks)) {
            onTaskToggle(task.id)
          }
        }}
        className={`mt-0.5 transition-colors ${
          task.completed 
            ? 'text-zinc-400' 
            : allTasks && isTaskBlocked(task, allTasks)
            ? 'text-zinc-500 cursor-not-allowed'
            : priorityColors[task.priority]
        }`}
        disabled={allTasks && isTaskBlocked(task, allTasks)}
        title={allTasks && isTaskBlocked(task, allTasks) ? 'Complete dependencies first' : ''}
      >
        {task.completed ? (
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
            <div className="flex items-center gap-2">
              <p className={`text-sm break-words whitespace-normal overflow-hidden ${
                task.completed ? 'line-through text-zinc-500' : 
                allTasks && isTaskBlocked(task, allTasks) ? 'text-zinc-400' : 'text-white'
              }`}>
                {task.name}
              </p>
              {allTasks && isTaskBlocked(task, allTasks) && !task.completed && (
                <div className="flex items-center gap-1 text-[rgb(var(--theme-primary-rgb))]" title="Task is blocked by dependencies">
                  <Link2 className="w-3 h-3" />
                  <span className="text-xs">Blocked</span>
                </div>
              )}
            </div>
            
            {task.description && (
              <p className="text-xs text-zinc-400 mt-1 line-clamp-2 break-words">
                {task.description}
              </p>
            )}

            <div className="flex items-center gap-3 mt-2 text-xs">
              {task.due_date && (
                <span className={`flex items-center gap-1 ${getDueDateColor(task.due_date)}`}>
                  <Calendar className="w-3 h-3" />
                  {formatDueDate(task.due_date)}
                  {task.due_time && ` at ${task.due_time}`}
                </span>
              )}
              
              {task.deadline && (
                <span className="flex items-center gap-1 text-red-400">
                  <Flag className="w-3 h-3" />
                  Deadline: {formatDueDate(task.deadline)}
                </span>
              )}
              
              {task.assignedToName && (
                <span className="flex items-center gap-1 text-zinc-400">
                  <User className="w-3 h-3" />
                  {task.assignedToName}
                </span>
              )}
              
              {task.recurringPattern && (
                <span className="text-purple-400">
                  🔁 {task.recurringPattern}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!task.completed && (
              <Flag className={`w-4 h-4 ${priorityColors[task.priority]}`} />
            )}
            
            <div className="relative">
              <button
                onClick={() => setMenuOpenTask(menuOpenTask === task.id ? null : task.id)}
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white transition-opacity"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              
              {menuOpenTask === task.id && (
                <div className="absolute right-0 top-6 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-10">
                  <button
                    onClick={() => {
                      onTaskEdit(task)
                      setMenuOpenTask(null)
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white w-full"
                  >
                    <Edit className="w-4 h-4" />
                    Edit task
                  </button>
                  <button
                    onClick={() => {
                      onTaskDelete(task.id)
                      setMenuOpenTask(null)
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 hover:text-red-300 w-full"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete task
                  </button>
                </div>
              )}
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
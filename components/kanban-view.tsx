"use client"

import { useState } from 'react'
import { Calendar, Hash, Link2, AlertCircle } from 'lucide-react'
import { Task, Project, Database } from '@/lib/types'
import { format, isToday, isTomorrow, isThisWeek, addDays, startOfWeek, endOfWeek, isPast, isFuture } from 'date-fns'
import { isTaskBlocked } from '@/lib/dependency-utils'

interface KanbanViewProps {
  tasks: Task[]
  allTasks?: Task[] // For dependency checking
  projects: Project[]
  onTaskToggle: (taskId: string) => void
  onTaskEdit: (task: Task) => void
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void
  dateType?: 'dueDate' | 'deadline' // Which date field to use for grouping
}

interface KanbanColumn {
  id: string
  title: string
  tasks: Task[]
}

export function KanbanView({ tasks, allTasks, projects, onTaskToggle, onTaskEdit, onTaskUpdate, dateType = 'dueDate' }: KanbanViewProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  // Helper function to get project by ID
  const getProject = (projectId: string) => projects.find(p => p.id === projectId)

  // Group tasks by date categories
  const groupTasksByDate = (): KanbanColumn[] => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const tomorrow = addDays(today, 1)
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 }) // Sunday
    
    const columns: KanbanColumn[] = [
      { id: 'overdue', title: 'Overdue', tasks: [] },
      { id: 'today', title: 'Today', tasks: [] },
      { id: 'tomorrow', title: 'Tomorrow', tasks: [] },
      { id: 'this-week', title: 'This Week', tasks: [] },
      { id: 'next-week', title: 'Next Week', tasks: [] },
      { id: 'later', title: 'Later', tasks: [] }
    ]

    // Sort tasks into columns
    tasks.forEach(task => {
      const dateValue = dateType === 'deadline' ? task.deadline : task.due_date
      if (!dateValue) return
      
      const taskDate = new Date(dateValue)
      taskDate.setHours(0, 0, 0, 0)
      
      if (taskDate < today) {
        columns[0].tasks.push(task) // Overdue
      } else if (isToday(taskDate)) {
        columns[1].tasks.push(task) // Today
      } else if (isTomorrow(taskDate)) {
        columns[2].tasks.push(task) // Tomorrow
      } else if (isThisWeek(taskDate) && taskDate > tomorrow) {
        columns[3].tasks.push(task) // This Week
      } else if (taskDate >= addDays(weekEnd, 1) && taskDate <= addDays(weekEnd, 7)) {
        columns[4].tasks.push(task) // Next Week
      } else {
        columns[5].tasks.push(task) // Later
      }
    })

    // Sort tasks within each column by the selected date type
    columns.forEach(column => {
      column.tasks.sort((a, b) => {
        const aDate = dateType === 'deadline' ? a.deadline : a.due_date
        const bDate = dateType === 'deadline' ? b.deadline : b.due_date
        if (!aDate || !bDate) return 0
        const dateA = new Date(aDate).getTime()
        const dateB = new Date(bDate).getTime()
        return dateA - dateB
      })
    })

    return columns
  }

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(columnId)
  }

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    setDragOverColumn(null)
    
    if (!draggedTask) return

    // Calculate new date based on column
    const currentDateValue = dateType === 'deadline' ? draggedTask.deadline : draggedTask.due_date
    let newDate: string | undefined = currentDateValue
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    switch (columnId) {
      case 'overdue':
        // Keep the original date (it's already overdue)
        break
      case 'today':
        newDate = format(today, 'yyyy-MM-dd')
        break
      case 'tomorrow':
        newDate = format(addDays(today, 1), 'yyyy-MM-dd')
        break
      case 'this-week':
        // Set to next available day this week
        const daysUntilWeekEnd = 7 - today.getDay()
        const targetDay = Math.min(3, daysUntilWeekEnd) // Try to set mid-week
        newDate = format(addDays(today, targetDay), 'yyyy-MM-dd')
        break
      case 'next-week':
        // Set to next Monday
        const daysUntilNextMonday = ((1 - today.getDay() + 7) % 7) || 7
        newDate = format(addDays(today, daysUntilNextMonday + 7), 'yyyy-MM-dd')
        break
      case 'later':
        // Set to 2 weeks from now
        newDate = format(addDays(today, 14), 'yyyy-MM-dd')
        break
    }

    if (newDate !== currentDateValue) {
      const updateField = dateType === 'deadline' ? { deadline: newDate } : { due_date: newDate }
      onTaskUpdate(draggedTask.id, updateField)
    }

    setDraggedTask(null)
  }

  const columns = groupTasksByDate()

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth">
      {columns.map(column => (
        <div
          key={column.id}
          className={`flex-shrink-0 w-[20%] min-w-[300px] bg-zinc-900 rounded-lg p-4 snap-start ${
            dragOverColumn === column.id ? 'ring-2 ring-zinc-600' : ''
          }`}
          onDragOver={(e) => handleDragOver(e, column.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">{column.title}</h3>
            {column.tasks.length > 0 && (
              <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded">
                {column.tasks.length}
              </span>
            )}
          </div>
          
          <div className="space-y-2">
            {column.tasks.map(task => {
              const project = getProject(task.projectId)
              
              return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task)}
                  className={`bg-zinc-800 rounded-lg p-3 cursor-move hover:bg-zinc-700 transition-colors ${
                    draggedTask?.id === task.id ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => {
                        if (!allTasks || !isTaskBlocked(task, allTasks)) {
                          onTaskToggle(task.id)
                        }
                      }}
                      disabled={allTasks && isTaskBlocked(task, allTasks)}
                      className={`mt-0.5 rounded border-zinc-600 focus:ring-offset-0 bg-zinc-700 ${
                        allTasks && isTaskBlocked(task, allTasks) 
                          ? 'text-zinc-500 cursor-not-allowed' 
                          : 'text-red-500 focus:ring-red-500'
                      }`}
                      title={allTasks && isTaskBlocked(task, allTasks) ? 'Complete dependencies first' : ''}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          onClick={() => onTaskEdit(task)}
                          className={`text-sm cursor-pointer ${
                            task.completed ? 'line-through text-zinc-500' :
                            allTasks && isTaskBlocked(task, allTasks) ? 'text-zinc-400' : 
                            'text-white hover:text-zinc-300'
                          }`}
                        >
                          {task.name}
                        </div>
                        {allTasks && isTaskBlocked(task, allTasks) && !task.completed && (
                          <div className="flex items-center gap-1 text-[rgb(var(--theme-primary-rgb))]" title="Task is blocked by dependencies">
                            <Link2 className="w-3 h-3" />
                            <span className="text-xs">Blocked</span>
                          </div>
                        )}
                      </div>
                      
                      {task.description && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-3 mt-2">
                        {project && (
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3" style={{ color: project.color }} />
                            <span className="text-xs text-zinc-400">{project.name}</span>
                          </div>
                        )}
                        
                        {task.due_date && (
                          <div className="flex items-center gap-1 text-xs text-zinc-400">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(task.due_date), 'MMM d')}
                          </div>
                        )}
                        
                        {task.deadline && (
                          <span className="text-xs text-red-400">
                            Deadline: {format(new Date(task.deadline), 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            
            {column.tasks.length === 0 && (
              <div className="text-center py-8 text-zinc-500 text-sm">
                No tasks
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
"use client"

import { useState, useRef, useEffect } from 'react'
import { X, Calendar, Clock, Flag, Bell, Paperclip, Hash, User, Tag, Plus, Circle, CheckCircle2, Trash2, CornerDownRight, Link2, AlertCircle, Check } from 'lucide-react'
import { Database, Task, Reminder } from '@/lib/types'
import { format } from 'date-fns'
import { canBeSelectedAsDependency, getBlockingTasks, isTaskBlocked } from '@/lib/dependency-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select"
import { TimePicker } from '@/components/time-picker'
import { UserAvatar } from '@/components/user-avatar'

const quickProjectColors = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
]

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  data: Database
  task?: Task | null // Optional - if provided, it's edit mode
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | Partial<Task>) => void
  onDelete?: (taskId: string) => void
  onDataRefresh?: () => void
  defaultProjectId?: string
  onTaskSelect?: (task: Task) => void
}

export function TaskModal({ 
  isOpen, 
  onClose, 
  data, 
  task, 
  onSave, 
  onDelete,
  onDataRefresh, 
  defaultProjectId,
  onTaskSelect 
}: TaskModalProps) {
  const isEditMode = !!task
  const [taskName, setTaskName] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState<string>('')
  const [deadline, setDeadline] = useState('')
  const [deadlineTime, setDeadlineTime] = useState<string>('')
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(4)
  const [selectedProject, setSelectedProject] = useState(defaultProjectId || '')
  const [selectedParentTask, setSelectedParentTask] = useState<string | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showReminderInput, setShowReminderInput] = useState(false)
  const [newReminderDate, setNewReminderDate] = useState('')
  const [newReminderTime, setNewReminderTime] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const [newSubtaskName, setNewSubtaskName] = useState('')
  const [isAddingSubtask, setIsAddingSubtask] = useState(false)
  const [tagSuggestions, setTagSuggestions] = useState<typeof data.tags>([])
  const [bouncingTagId, setBouncingTagId] = useState<string | null>(null)
  const [showProjectSuggestions, setShowProjectSuggestions] = useState(false)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [dependencies, setDependencies] = useState<string[]>([])
  const [showDependencyPicker, setShowDependencyPicker] = useState(false)
  const [dependencySearchQuery, setDependencySearchQuery] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)

  // Searchable dropdown states
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false)
  const [priorityFilterQuery, setPriorityFilterQuery] = useState('')
  const projectDropdownRef = useRef<HTMLDivElement>(null)
  const priorityDropdownRef = useRef<HTMLDivElement>(null)

  // Load task data in edit mode
  useEffect(() => {
    if (task && isEditMode) {
      setTaskName(task.name)
      setDescription(task.description || '')
      // Handle both snake_case and camelCase for due date
      const dueDate = (task as any).due_date || task.dueDate
      const dueTime = (task as any).due_time || task.dueTime
      setDueDate(dueDate || '')
      setDueTime(dueTime || '')
      setDeadline(task.deadline ? task.deadline.split('T')[0] : '')
      setDeadlineTime(task.deadline && task.deadline.includes('T') ? task.deadline.split('T')[1].substring(0, 5) : '')
      setPriority(task.priority)
      // Handle both snake_case and camelCase for projectId
      const projectId = (task as any).project_id || task.projectId || ''
      // If no project, try to select the first available project as default
      if (!projectId && data?.projects?.length > 0) {
        const firstProject = data.projects.find(p => !p.archived)
        setSelectedProject(firstProject?.id || '')
      } else {
        setSelectedProject(projectId)
      }
      // Handle both snake_case and camelCase for parentId
      const parentId = (task as any).parent_id || task.parentId
      setSelectedParentTask(parentId || null)
      setSelectedTags(task.tags || [])
      // Handle both snake_case and camelCase for assignedTo
      const assignedTo = (task as any).assigned_to || task.assignedTo
      setAssignedTo(assignedTo || null)
      setReminders(task.reminders || [])
      // Handle both snake_case and camelCase for dependsOn
      const dependsOn = (task as any).depends_on || task.dependsOn
      setDependencies(dependsOn || [])
    }
  }, [task, isEditMode, data])

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen && !isEditMode) {
      // Reset form for add mode
      setTaskName('')
      setDescription('')
      setDueDate('')
      setDueTime('')
      setDeadline('')
      setDeadlineTime('')
      setPriority(4)
      setSelectedProject(defaultProjectId || '')
      setSelectedParentTask(null)
      setReminders([])
      setSelectedTags([])
      setAssignedTo(null)
      setShowReminderInput(false)
      setNewReminderDate('')
      setShowProjectSuggestions(false)
      setProjectSearchQuery('')
      setNewReminderTime('')
      setShowAddTag(false)
      setNewTagName('')
      setShowUserDropdown(false)
      setUserSearchQuery('')
      setDependencies([])
      setShowDependencyPicker(false)
      setDependencySearchQuery('')
      setShowProjectDropdown(false)
      setProjectFilterQuery('')
      setShowPriorityDropdown(false)
      setPriorityFilterQuery('')
    }
  }, [isOpen, defaultProjectId, isEditMode])

  useEffect(() => {
    if (!isOpen || isEditMode) return
    if (dueDate) return
    setDueDate(format(new Date(), 'yyyy-MM-dd'))
  }, [isOpen, isEditMode, dueDate])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      // Check if click is inside modal
      if (modalRef.current && modalRef.current.contains(target)) {
        return
      }
      
      // Check if click is inside any popover content (for time picker, selects, etc)
      const popoverContent = (target as Element)?.closest('[data-radix-popper-content-wrapper]')
      if (popoverContent) {
        return
      }
      
      // If not inside modal or popover, close the modal
      onClose()
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  // Close project/priority dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false)
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target as Node)) {
        setShowPriorityDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Update tag suggestions when typing
  useEffect(() => {
    if (newTagName.trim()) {
      const filtered = data.tags.filter(tag => 
        tag.name.toLowerCase().includes(newTagName.toLowerCase())
      )
      setTagSuggestions(filtered)
    } else {
      setTagSuggestions([])
    }
  }, [newTagName, data.tags])

  // Automatically add reminder when date is selected (time optional)
  useEffect(() => {
    if (newReminderDate && showReminderInput) {
      const datetime = newReminderTime 
        ? `${newReminderDate}T${newReminderTime}:00`
        : `${newReminderDate}T09:00:00`
      
      setReminders(prevReminders => [...prevReminders, {
        id: `reminder-${Date.now()}`,
        type: 'custom' as const,
        value: datetime
      }])
      setNewReminderDate('')
      setNewReminderTime('')
      setShowReminderInput(false)
    }
  }, [newReminderDate, newReminderTime, showReminderInput])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate that a project is selected
    if (!selectedProject) {
      console.error('No project selected')
      alert('Please select a project')
      return
    }
    
    const taskData: any = {
      name: taskName,
      description,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      deadline: deadline ? (deadlineTime ? `${deadline}T${deadlineTime}` : deadline) : undefined,
      priority,
      projectId: selectedProject,
      parentId: selectedParentTask || undefined,
      tags: selectedTags,
      files: [],
      assignedTo: assignedTo || undefined,
      reminders,
      dependsOn: dependencies.length > 0 ? dependencies : undefined,
    }

    if (!isEditMode) {
      taskData.completed = false
    }

    onSave(taskData)
    onClose()
  }

  const handleAddReminder = () => {
    if (newReminderDate) {
      const datetime = newReminderTime 
        ? `${newReminderDate}T${newReminderTime}:00`
        : `${newReminderDate}T09:00:00`
      
      setReminders([...reminders, {
        id: `reminder-${Date.now()}`,
        type: 'custom' as const,
        value: datetime
      }])
      setNewReminderDate('')
      setNewReminderTime('')
      setShowReminderInput(false)
    }
  }

  const handleRemoveReminder = (id: string) => {
    setReminders(reminders.filter(r => r.id !== id))
  }

  const getDefaultOrganizationId = () => {
    if (selectedProject) {
      const project = data.projects.find(p => p.id === selectedProject) as any
      return project?.organizationId || project?.organization_id || ''
    }
    return data.organizations?.[0]?.id || ''
  }

  const applyProjectTagToTitle = (projectName: string) => {
    const beforeCursor = taskName.substring(0, cursorPosition)
    const afterCursor = taskName.substring(cursorPosition)
    const lastHashIndex = beforeCursor.lastIndexOf('#')
    if (lastHashIndex !== -1) {
      const newTaskName = `${taskName.substring(0, lastHashIndex)}#${projectName} ${afterCursor}`
      setTaskName(newTaskName)
    }
  }

  const createProjectQuick = async (
    name: string,
    options?: { insertInTitle?: boolean; closeSuggestions?: boolean; closeDropdown?: boolean }
  ) => {
    const trimmedName = name.trim()
    if (!trimmedName || isCreatingProject) return

    const existingProject = data.projects.find(
      p => p.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (existingProject) {
      setSelectedProject(existingProject.id)
      if (options?.insertInTitle) {
        applyProjectTagToTitle(existingProject.name)
      }
      if (options?.closeSuggestions) {
        setShowProjectSuggestions(false)
        setProjectSearchQuery('')
      }
      if (options?.closeDropdown) {
        setShowProjectDropdown(false)
        setProjectFilterQuery('')
      }
      return
    }

    const organizationId = getDefaultOrganizationId()
    if (!organizationId) {
      alert('No organization available to create this project.')
      return
    }

    setIsCreatingProject(true)
    try {
      const color = quickProjectColors[Math.floor(Math.random() * quickProjectColors.length)]
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: trimmedName,
          color,
          organization_id: organizationId,
          is_favorite: false,
          archived: false
        })
      })

      if (response.ok) {
        const newProject = await response.json()
        if (newProject?.id) {
          setSelectedProject(newProject.id)
        }
        if (options?.insertInTitle) {
          applyProjectTagToTitle(trimmedName)
        }
        if (options?.closeSuggestions) {
          setShowProjectSuggestions(false)
          setProjectSearchQuery('')
        }
        if (options?.closeDropdown) {
          setShowProjectDropdown(false)
          setProjectFilterQuery('')
        }
        if (onDataRefresh) onDataRefresh()
        titleInputRef.current?.focus()
      }
    } catch (error) {
      console.error('Failed to create project:', error)
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleAddTag = async () => {
    if (newTagName.trim()) {
      const existingTag = data.tags.find(t => 
        t.name.toLowerCase() === newTagName.trim().toLowerCase()
      )
      
      if (existingTag) {
        if (!selectedTags.includes(existingTag.id)) {
          setSelectedTags([...selectedTags, existingTag.id])
        }
      } else {
        const newTag = {
          id: `tag-${Date.now()}`,
          name: newTagName.trim(),
          color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
        }
        
        try {
          const response = await fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTag)
          })
          
          if (response.ok) {
            setSelectedTags([...selectedTags, newTag.id])
            if (onDataRefresh) onDataRefresh()
          }
        } catch (error) {
          console.error('Failed to create tag:', error)
        }
      }
      
      setNewTagName('')
      setShowAddTag(false)
    }
  }

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSelectTagSuggestion = (tag: typeof data.tags[0]) => {
    if (selectedTags.includes(tag.id)) {
      // Tag is already selected, bounce it and close the input
      setBouncingTagId(tag.id)
      setTimeout(() => setBouncingTagId(null), 600) // Remove bounce class after animation
      setNewTagName('')
      setShowAddTag(false)
    } else {
      // Add the tag normally
      setSelectedTags([...selectedTags, tag.id])
      setNewTagName('')
      setShowAddTag(false)
    }
  }

  const handleAssignUser = (userId: string) => {
    setAssignedTo(userId)
    setShowUserDropdown(false)
    setUserSearchQuery('')
  }

  // Get assigned user details
  const assignedUser = data.users.find(u => u.id === assignedTo)

  const handleAddSubtask = async () => {
    if (!newSubtaskName.trim() || !task) return

    const subtask: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
      name: newSubtaskName.trim(),
      completed: false,
      priority: 4,
      projectId: task.projectId,
      parentId: task.id,
      tags: [],
      files: [],
      reminders: []
    }

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subtask)
      })

      if (response.ok) {
        setNewSubtaskName('')
        setIsAddingSubtask(false)
        if (onDataRefresh) onDataRefresh()
      }
    } catch (error) {
      console.error('Failed to create subtask:', error)
    }
  }

  const toggleSubtaskComplete = async (subtask: Task) => {
    try {
      const response = await fetch(`/api/tasks/${subtask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !subtask.completed })
      })

      if (response.ok && onDataRefresh) {
        onDataRefresh()
      }
    } catch (error) {
      console.error('Failed to update subtask:', error)
    }
  }

  if (!isOpen) return null

  const currentProject = data.projects.find(p => p.id === selectedProject)
  const projectColor = currentProject?.color || '#6B7280'
  const parentTask = task && task.parentId 
    ? data.tasks.find(t => t.id === task.parentId) 
    : null
  const subtasks = isEditMode && task
    ? data.tasks.filter(t => t.parentId === task.id)
    : []
  
  // Highlight deadlines
  const deadlineHighlight = deadline && new Date(deadline) < new Date() 
    ? 'text-red-500' 
    : deadline && new Date(deadline) < new Date(Date.now() + 24 * 60 * 60 * 1000)
    ? 'text-[rgb(var(--theme-primary-rgb))]'
    : ''

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-zinc-800"
      >
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-white">
            {isEditMode ? 'Edit Task' : 'Add Task'}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Parent task navigation (edit mode only) */}
          {isEditMode && parentTask && onTaskSelect && (
            <button
              type="button"
              onClick={() => onTaskSelect(parentTask)}
              className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-2"
            >
              ← Go to parent task: {parentTask.name}
            </button>
          )}

          {/* Task Name */}
          <div className="relative">
            <input
              ref={titleInputRef}
              type="text"
              value={taskName}
              onChange={(e) => {
                const value = e.target.value
                const cursorPos = e.target.selectionStart || 0
                setTaskName(value)
                setCursorPosition(cursorPos)
                
                // Check if user typed # 
                const beforeCursor = value.substring(0, cursorPos)
                const lastHashIndex = beforeCursor.lastIndexOf('#')
                
                if (lastHashIndex !== -1 && lastHashIndex === cursorPos - 1) {
                  // Just typed #, show all projects
                  setShowProjectSuggestions(true)
                  setProjectSearchQuery('')
                } else if (lastHashIndex !== -1 && showProjectSuggestions) {
                  // Check if we're still in a project search (no space after #)
                  const afterHash = value.substring(lastHashIndex + 1, cursorPos)
                  if (!afterHash.includes(' ')) {
                    setProjectSearchQuery(afterHash)
                  } else {
                    setShowProjectSuggestions(false)
                  }
                } else {
                  setShowProjectSuggestions(false)
                }
              }}
              onKeyDown={(e) => {
                if (showProjectSuggestions && (e.key === 'Escape' || (e.key === ' ' && projectSearchQuery === ''))) {
                  setShowProjectSuggestions(false)
                }
              }}
              placeholder="Task name"
              className="w-full bg-zinc-800 rounded-lg px-4 py-3 text-sm font-medium text-white placeholder-zinc-500 border border-zinc-700 focus-theme transition-all"
              required
              autoFocus
            />
            
            {/* Project Suggestions Dropdown */}
            {showProjectSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {(() => {
                  const query = projectSearchQuery.trim()
                  const matches = data.projects.filter(project =>
                    project.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
                  )
                  const hasExactMatch = query.length > 0 && data.projects.some(
                    project => project.name.toLowerCase() === query.toLowerCase()
                  )

                  return (
                    <>
                      {matches.map(project => {
                        const orgId = (project as any).organizationId || (project as any).organization_id
                        const org = data.organizations.find(o => o.id === orgId)
                        return (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => {
                              // Replace the #query with the project name
                              const beforeCursor = taskName.substring(0, cursorPosition)
                              const afterCursor = taskName.substring(cursorPosition)
                              const lastHashIndex = beforeCursor.lastIndexOf('#')
                              
                              if (lastHashIndex !== -1) {
                                const newTaskName = 
                                  taskName.substring(0, lastHashIndex) + 
                                  '#' + project.name + ' ' +
                                  afterCursor
                                setTaskName(newTaskName)
                                setSelectedProject(project.id)
                              }
                              
                              setShowProjectSuggestions(false)
                              setProjectSearchQuery('')
                              
                              // Focus back on input
                              titleInputRef.current?.focus()
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-zinc-700 transition-colors flex items-center gap-2"
                          >
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: project.color }} 
                            />
                            <span className="text-sm text-white">{project.name}</span>
                            {org && <span className="text-xs text-zinc-400">• {org.name}</span>}
                          </button>
                        )
                      })}
                      {query && !hasExactMatch && (
                        <button
                          type="button"
                          onClick={() => createProjectQuick(query, { insertInTitle: true, closeSuggestions: true })}
                          disabled={isCreatingProject}
                          className="w-full px-4 py-2 text-left hover:bg-zinc-700 transition-colors flex items-center gap-2 text-zinc-200"
                        >
                          <Plus className="w-3 h-3" />
                          <span className="text-sm">
                            {isCreatingProject ? 'Creating project...' : `Create project "${query}"`}
                          </span>
                        </button>
                      )}
                      {matches.length === 0 && !query && (
                        <div className="px-4 py-2 text-sm text-zinc-400">No projects found</div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="w-full bg-zinc-800 text-white rounded-lg px-4 py-3 text-sm placeholder-zinc-500 border border-zinc-700 focus-theme min-h-[100px] resize-none transition-all"
          />

          {/* Project & Parent Task */}
          <div className="grid grid-cols-2 gap-4">
            <div ref={projectDropdownRef}>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <Hash className="w-4 h-4" />
                Project
              </div>
              <div className="relative">
                {showProjectDropdown ? (
                  <input
                    type="text"
                    value={projectFilterQuery}
                    onChange={(e) => setProjectFilterQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const query = projectFilterQuery.trim()
                        if (query) {
                          createProjectQuick(query, { closeDropdown: true })
                        }
                      }
                    }}
                    placeholder="Search projects..."
                    className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectDropdown(true)
                      setProjectFilterQuery('')
                    }}
                    className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all flex items-center justify-between"
                  >
                    {selectedProject && data?.projects ? (() => {
                      const project = data.projects.find(p => p.id === selectedProject)
                      return project ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: project.color }}
                          />
                          <span>{project.name}</span>
                        </div>
                      ) : <span className="text-zinc-400">Select a project</span>
                    })() : <span className="text-zinc-400">Select a project</span>}
                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}

                {showProjectDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {(() => {
                      const query = projectFilterQuery.trim()
                      const hasExactMatch = query.length > 0 && data.projects.some(
                        project => project.name.toLowerCase() === query.toLowerCase()
                      )
                      if (!query || hasExactMatch) return null
                      return (
                        <button
                          type="button"
                          onClick={() => createProjectQuick(query, { closeDropdown: true })}
                          disabled={isCreatingProject}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors text-zinc-200 hover:bg-zinc-700 border-b border-zinc-700"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{isCreatingProject ? 'Creating project...' : `Create project "${query}"`}</span>
                        </button>
                      )
                    })()}
                    {data?.organizations?.map((org) => {
                      const orgProjects = data.projects?.filter(p =>
                        p.organizationId === org.id &&
                        !p.archived &&
                        p.name.toLowerCase().includes(projectFilterQuery.toLowerCase())
                      ) || []
                      if (orgProjects.length === 0) return null

                      return (
                        <div key={org.id}>
                          <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-800/50 sticky top-0">
                            {org.name}
                          </div>
                          {orgProjects.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => {
                                setSelectedProject(project.id)
                                setShowProjectDropdown(false)
                                setProjectFilterQuery('')
                              }}
                              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                                selectedProject === project.id
                                  ? 'bg-[rgb(var(--theme-primary-rgb))]/20 text-white'
                                  : 'text-zinc-300 hover:bg-zinc-700'
                              }`}
                            >
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: project.color }}
                              />
                              <span>{project.name}</span>
                              {selectedProject === project.id && (
                                <Check className="w-4 h-4 ml-auto text-[rgb(var(--theme-primary-rgb))]" />
                              )}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                    {/* Orphan projects */}
                    {(() => {
                      const orphanProjects = data.projects?.filter(p =>
                        !p.organizationId &&
                        !p.archived &&
                        p.name.toLowerCase().includes(projectFilterQuery.toLowerCase())
                      ) || []
                      if (orphanProjects.length > 0) {
                        return (
                          <div>
                            <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-800/50 sticky top-0">
                              Other
                            </div>
                            {orphanProjects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                onClick={() => {
                                  setSelectedProject(project.id)
                                  setShowProjectDropdown(false)
                                  setProjectFilterQuery('')
                                }}
                                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                                  selectedProject === project.id
                                    ? 'bg-[rgb(var(--theme-primary-rgb))]/20 text-white'
                                    : 'text-zinc-300 hover:bg-zinc-700'
                                }`}
                              >
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: project.color }}
                                />
                                <span>{project.name}</span>
                                {selectedProject === project.id && (
                                  <Check className="w-4 h-4 ml-auto text-[rgb(var(--theme-primary-rgb))]" />
                                )}
                              </button>
                            ))}
                          </div>
                        )
                      }
                      return null
                    })()}
                    {/* No results */}
                    {projectFilterQuery && data.projects?.filter(p =>
                      !p.archived && p.name.toLowerCase().includes(projectFilterQuery.toLowerCase())
                    ).length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-500">No projects found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <Hash className="w-4 h-4" />
                Parent Task (Optional)
              </div>
              <Select 
                value={selectedParentTask || 'none'} 
                onValueChange={(value) => setSelectedParentTask(value === 'none' ? null : value)}
                disabled={!selectedProject}
              >
                <SelectTrigger className="w-full bg-zinc-800 text-white border-zinc-700 focus:ring-2 ring-theme transition-all">
                  <SelectValue placeholder={
                    !selectedProject 
                      ? "Select a project first" 
                      : "No parent task"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {selectedProject && (
                    <>
                      <SelectItem value="none">
                        <span className="text-zinc-400">No parent task</span>
                      </SelectItem>
                      {data.tasks
                        .filter(t => t.projectId === selectedProject && !t.completed && (!isEditMode || t.id !== task?.id))
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              <span>{t.parentId ? '↳ ' : ''}{t.name}</span>
                            </div>
                          </SelectItem>
                        ))
                      }
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due Date & Time */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
              <Calendar className="w-4 h-4" />
              Due Date
            </div>
            <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
              <Calendar className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 bg-transparent text-white pl-3 pr-2 py-3 focus:outline-none themed-date-input"
              />
              <button
                onClick={() => setDueDate('')}
                className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
              <Clock className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
              <TimePicker
                value={dueTime}
                onChange={setDueTime}
                placeholder="Select time"
                className="bg-transparent border-0 hover:bg-transparent focus:ring-0 flex-1"
              />
              {dueTime && (
                <button
                  onClick={() => setDueTime('')}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          </div>
          
          {/* Deadline */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
              <Calendar className="w-4 h-4" />
              Deadline
              {deadlineHighlight && (
                <span className={`text-xs ${deadlineHighlight}`}>
                  {new Date(deadline) < new Date() ? 'Overdue' : 'Due soon'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Calendar className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={`flex-1 bg-transparent pl-3 pr-2 py-3 focus:outline-none themed-date-input ${
                    deadlineHighlight ? deadlineHighlight : 'text-white'
                  }`}
                />
                <button
                  onClick={() => setDeadline('')}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Clock className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <TimePicker
                  value={deadlineTime}
                  onChange={setDeadlineTime}
                  placeholder="Select time"
                  className="bg-transparent border-0 hover:bg-transparent focus:ring-0 flex-1"
                />
                {deadlineTime && (
                  <button
                    onClick={() => setDeadlineTime('')}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>


          {/* Assignee & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <User className="w-4 h-4" />
                Assigned to
              </div>
              {assignedUser ? (
                <div className="flex items-center gap-2 text-sm bg-zinc-800 rounded px-3 py-2.5 h-[42px]">
                  <UserAvatar
                    name={assignedUser.name || `${assignedUser.firstName || ''} ${assignedUser.lastName || ''}`.trim() || assignedUser.email}
                    profileColor={assignedUser.profileColor}
                    memoji={assignedUser.profileMemoji}
                    size={24}
                    className="text-xs font-medium flex-shrink-0"
                  />
                  <span className="text-zinc-300 flex-1">
                    {assignedUser.name || 
                     `${assignedUser.firstName || ''} ${assignedUser.lastName || ''}`.trim() ||
                     assignedUser.email ||
                     'Unknown User'}
                    {assignedUser.status === 'pending' && (
                      <span className="ml-2 text-xs text-yellow-500">(Pending)</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAssignedTo(null)}
                    className="text-zinc-500 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : showUserDropdown ? (
                <div className="relative">
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search users..."
                    className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
                    autoFocus
                  />
                  <div className="absolute top-full mt-1 w-full bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 max-h-48 overflow-y-auto z-50">
                    {data.users
                      .filter(user => {
                        const userName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || ''
                        const userEmail = user.email || ''
                        return userName.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                               userEmail.toLowerCase().includes(userSearchQuery.toLowerCase())
                      })
                      .map(user => {
                        const displayName = user.name || 
                          `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
                          user.email || 
                          'Unknown User'
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleAssignUser(user.id)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-700 transition-colors text-left"
                          >
                            <UserAvatar
                              name={displayName}
                              profileColor={user.profileColor}
                              memoji={user.profileMemoji}
                              size={24}
                              className="text-xs font-medium flex-shrink-0"
                            />
                            <div className="flex-1 text-sm">
                              <p className="font-medium">
                                {displayName}
                                {user.status === 'pending' && (
                                  <span className="ml-2 text-xs text-yellow-500">(Pending)</span>
                                )}
                              </p>
                              <p className="text-xs text-zinc-500">{user.email}</p>
                            </div>
                          </button>
                        )
                      })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false)
                      setUserSearchQuery('')
                    }}
                    className="absolute right-2 top-2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUserDropdown(true)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors text-sm w-full h-[42px]"
                >
                  <User className="w-4 h-4" />
                  Assign to someone
                </button>
              )}
            </div>

            <div ref={priorityDropdownRef}>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <Flag className="w-4 h-4" />
                Priority
              </div>
              <div className="relative">
                {showPriorityDropdown ? (
                  <input
                    type="text"
                    value={priorityFilterQuery}
                    onChange={(e) => setPriorityFilterQuery(e.target.value)}
                    placeholder="Search priority..."
                    className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPriorityDropdown(true)
                      setPriorityFilterQuery('')
                    }}
                    className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        priority === 1 ? 'bg-red-500' :
                        priority === 2 ? 'bg-orange-500' :
                        priority === 3 ? 'bg-blue-500' :
                        'bg-zinc-500'
                      }`} />
                      <span>Priority {priority} {priority === 1 ? '(Highest)' : priority === 4 ? '(Lowest)' : ''}</span>
                    </div>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}

                {showPriorityDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                    {[
                      { value: 1, label: 'Priority 1 (Highest)', color: 'bg-red-500' },
                      { value: 2, label: 'Priority 2 (High)', color: 'bg-orange-500' },
                      { value: 3, label: 'Priority 3 (Medium)', color: 'bg-blue-500' },
                      { value: 4, label: 'Priority 4 (Lowest)', color: 'bg-zinc-500' },
                    ]
                      .filter(p => p.label.toLowerCase().includes(priorityFilterQuery.toLowerCase()) ||
                                   `p${p.value}`.includes(priorityFilterQuery.toLowerCase()))
                      .map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => {
                            setPriority(p.value as 1 | 2 | 3 | 4)
                            setShowPriorityDropdown(false)
                            setPriorityFilterQuery('')
                          }}
                          className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                            priority === p.value
                              ? 'bg-[rgb(var(--theme-primary-rgb))]/20 text-white'
                              : 'text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${p.color}`} />
                          <span>{p.label}</span>
                          {priority === p.value && (
                            <Check className="w-4 h-4 ml-auto text-[rgb(var(--theme-primary-rgb))]" />
                          )}
                        </button>
                      ))}
                    {priorityFilterQuery && [1, 2, 3, 4].filter(p =>
                      `priority ${p}`.includes(priorityFilterQuery.toLowerCase()) ||
                      `p${p}`.includes(priorityFilterQuery.toLowerCase())
                    ).length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-500">No priorities found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reminders */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Bell className="w-4 h-4" />
                Reminders
              </div>
              {!showReminderInput && (
                <div
                  className="icon-circle-bg cursor-pointer"
                  onClick={() => setShowReminderInput(true)}
                  title="Add Reminder"
                >
                  <Plus className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            {reminders.map((reminder) => (
              <div key={reminder.id} className="flex items-center gap-2 mb-2 text-sm">
                <div className="bg-zinc-800 rounded px-3 py-1.5 flex items-center gap-2">
                  <Bell className="w-3 h-3 text-zinc-400" />
                  <span className="text-zinc-300">
                    {format(new Date(reminder.value), 'MMM d, yyyy h:mm a')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveReminder(reminder.id)}
                    className="text-zinc-500 hover:text-white ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {showReminderInput ? (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newReminderDate}
                  onChange={(e) => setNewReminderDate(e.target.value)}
                  className="flex-1 bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme transition-all themed-date-input"
                  placeholder="Select date"
                />
                <input
                  type="time"
                  value={newReminderTime}
                  onChange={(e) => setNewReminderTime(e.target.value)}
                  className="bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme transition-all themed-date-input"
                  placeholder="Time (optional)"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowReminderInput(false)
                    setNewReminderDate('')
                    setNewReminderTime('')
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Tag className="w-4 h-4" />
                Tags
              </div>
              {!showAddTag && (
                <div
                  className="icon-circle-bg cursor-pointer"
                  onClick={() => setShowAddTag(true)}
                  title="Add Tag"
                >
                  <Plus className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    selectedTags.includes(tag.id)
                      ? 'bg-opacity-100 text-white'
                      : 'bg-opacity-20 text-zinc-400 hover:bg-opacity-40'
                  } ${bouncingTagId === tag.id ? 'animate-bounce' : ''}`}
                  style={{ 
                    backgroundColor: selectedTags.includes(tag.id) 
                      ? tag.color 
                      : tag.color + '33' 
                  }}
                >
                  {tag.name}
                </button>
              ))}
              {showAddTag ? (
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      placeholder="Tag name"
                      className="bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme w-32 transition-all"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="text-zinc-400 hover:text-white"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddTag(false)
                        setNewTagName('')
                      }}
                      className="text-zinc-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {tagSuggestions.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-10 w-48 max-h-32 overflow-y-auto">
                      {tagSuggestions.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => handleSelectTagSuggestion(tag)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors flex items-center gap-2"
                        >
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-zinc-300">{tag.name}</span>
                          {selectedTags.includes(tag.id) && (
                            <span className="text-xs text-zinc-500 ml-auto">Selected</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Dependencies */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Link2 className="w-4 h-4" />
                Dependencies
                {isTaskBlocked(task || { id: 'temp', name: taskName, completed: false, dependsOn: dependencies } as unknown as Task, data.tasks) && (
                  <span className="text-xs text-[rgb(var(--theme-primary-rgb))] flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Blocked
                  </span>
                )}
              </div>
              {!showDependencyPicker && (
                <div
                  className="icon-circle-bg cursor-pointer"
                  onClick={() => setShowDependencyPicker(true)}
                  title="Add Dependency"
                >
                  <Plus className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            
            {/* Current Dependencies */}
            {dependencies.length > 0 && (
              <div className="space-y-2 mb-3">
                {dependencies.map(depId => {
                  const depTask = data.tasks.find(t => t.id === depId)
                  if (!depTask) return null
                  
                  return (
                    <div key={depId} className="flex items-center gap-2 bg-zinc-800 rounded px-3 py-2">
                      <button
                        type="button"
                        className="text-zinc-400 hover:text-white"
                        disabled
                      >
                        {depTask.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </button>
                      <span className={`flex-1 text-sm ${depTask.completed ? 'line-through text-zinc-500' : 'text-zinc-300'}`}>
                        {depTask.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDependencies(dependencies.filter(id => id !== depId))}
                        className="text-zinc-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            
            {/* Dependency Picker */}
            {showDependencyPicker && (
              <div className="relative mb-3">
                <input
                  type="text"
                  value={dependencySearchQuery}
                  onChange={(e) => setDependencySearchQuery(e.target.value)}
                  placeholder="Search tasks to depend on..."
                  className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
                  autoFocus
                />
                
                <div className="absolute top-full mt-1 w-full bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 max-h-48 overflow-y-auto z-50">
                  {data.tasks
                    .filter(t => {
                      // Don't show the current task or its subtasks
                      if (task && (t.id === task.id || t.parentId === task.id)) return false
                      // Filter by search
                      return t.name.toLowerCase().includes(dependencySearchQuery.toLowerCase())
                    })
                    .map(t => {
                      const validation = canBeSelectedAsDependency(
                        task?.id || 'new-task',
                        t.id,
                        data.tasks
                      )
                      
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (validation.canSelect) {
                              setDependencies([...dependencies, t.id])
                              setShowDependencyPicker(false)
                              setDependencySearchQuery('')
                            }
                          }}
                          disabled={!validation.canSelect}
                          className="w-full px-3 py-2 text-left hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <div className="flex-1">
                            <div className="text-sm text-zinc-300">{t.name}</div>
                            {!validation.canSelect && (
                              <div className="text-xs text-red-400">{validation.reason}</div>
                            )}
                          </div>
                          {t.completed && (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          )}
                        </button>
                      )
                    })}
                  
                  {data.tasks.filter(t => 
                    t.name.toLowerCase().includes(dependencySearchQuery.toLowerCase()) &&
                    (!task || t.id !== task.id)
                  ).length === 0 && (
                    <div className="px-3 py-2 text-sm text-zinc-500">No tasks found</div>
                  )}
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    setShowDependencyPicker(false)
                    setDependencySearchQuery('')
                  }}
                  className="absolute right-2 top-2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Subtasks (Edit mode only) */}
          {isEditMode && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <CornerDownRight className="w-4 h-4" />
                  Subtasks
                </div>
                {!isAddingSubtask && (
                  <div
                    className="icon-circle-bg cursor-pointer"
                    onClick={() => setIsAddingSubtask(true)}
                    title="Add Subtask"
                  >
                    <Plus className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              {subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => toggleSubtaskComplete(subtask)}
                    className="text-zinc-400 hover:text-white"
                  >
                    {subtask.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                  <span className={`flex-1 ${subtask.completed ? 'line-through text-zinc-500' : 'text-zinc-300'}`}>
                    {subtask.name}
                  </span>
                  {onTaskSelect && (
                    <button
                      type="button"
                      onClick={() => onTaskSelect(subtask)}
                      className="text-zinc-400 hover:text-white text-sm"
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
              {isAddingSubtask ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskName}
                    onChange={(e) => setNewSubtaskName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubtask())}
                    placeholder="Subtask name"
                    className="flex-1 bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddSubtask}
                    className="btn-theme-primary text-white rounded px-3 py-1.5 text-sm transition-all"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingSubtask(false)
                      setNewSubtaskName('')
                    }}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : null}
            </div>
          )}


          {/* Form Actions */}
          <div className="flex justify-between pt-6 border-t border-zinc-800">
            <div>
              {isEditMode && onDelete && task && (
                <span className="relative group/delete">
                  <button
                    type="button"
                    onClick={() => onDelete(task.id)}
                    className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/delete:opacity-100 transition-opacity pointer-events-none z-50">
                    Delete Task
                  </span>
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <span className="relative group/cancel">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/cancel:opacity-100 transition-opacity pointer-events-none z-50">
                  Cancel
                </span>
              </span>
              <span className="relative group/save">
                <button
                  type="submit"
                  className="p-2.5 btn-theme-primary text-white rounded-lg transition-all"
                >
                  <Check className="w-5 h-5" />
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/save:opacity-100 transition-opacity pointer-events-none z-50">
                  {isEditMode ? 'Save Changes' : 'Add Task'}
                </span>
              </span>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

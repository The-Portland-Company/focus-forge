"use client"

import { useState, useRef, useEffect } from 'react'
import { X, Calendar, Clock, Flag, Bell, Paperclip, Hash, User, Tag, Plus, Circle, CheckCircle2, Trash2, CornerDownRight, Link2, AlertCircle } from 'lucide-react'
import { Database, Task, Reminder } from '@/lib/types'
import { format } from 'date-fns'
import { canBeSelectedAsDependency, getBlockingTasks, isTaskBlocked } from '@/lib/dependency-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TimePicker } from '@/components/time-picker'
import { getBackgroundStyle } from '@/lib/style-utils'

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

  // Load task data in edit mode
  useEffect(() => {
    if (task && isEditMode) {
      setTaskName(task.name)
      setDescription(task.description || '')
      setDueDate(task.dueDate || '')
      setDueTime(task.dueTime || '')
      setDeadline(task.deadline ? task.deadline.split('T')[0] : '')
      setDeadlineTime(task.deadline && task.deadline.includes('T') ? task.deadline.split('T')[1].substring(0, 5) : '')
      setPriority(task.priority)
      setSelectedProject(task.projectId || '')
      setSelectedParentTask(task.parentId || null)
      setSelectedTags(task.tags || [])
      setAssignedTo(task.assignedTo || null)
      setReminders(task.reminders || [])
      setDependencies(task.dependsOn || [])
    }
  }, [task, isEditMode])

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
    }
  }, [isOpen, defaultProjectId, isEditMode])

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
                {data.projects
                  .filter(project => 
                    project.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
                  )
                  .map(project => {
                    const org = data.organizations.find(o => o.id === project.organizationId)
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
                  })
                }
                {data.projects.filter(p => p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())).length === 0 && (
                  <div className="px-4 py-2 text-sm text-zinc-400">No projects found</div>
                )}
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
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <Hash className="w-4 h-4" />
                Project
              </div>
              <Select 
                value={selectedProject} 
                onValueChange={setSelectedProject}
                required
              >
                <SelectTrigger className="w-full bg-zinc-800 text-white border-zinc-700 focus:ring-2 ring-theme transition-all">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {data.organizations.map((org) => {
                    const orgProjects = data.projects.filter(p => p.organizationId === org.id)
                    if (orgProjects.length === 0) return null
                    
                    return (
                      <div key={org.id}>
                        <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium">
                          {org.name}
                        </div>
                        {orgProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: project.color }}
                              />
                              <span>{project.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </div>
                    )
                  })}
                </SelectContent>
              </Select>
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
                <SelectContent className="bg-zinc-800 border-zinc-700">
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
                className="flex-1 bg-transparent text-white pl-3 pr-2 py-3 focus:outline-none"
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
                  className={`flex-1 bg-transparent pl-3 pr-2 py-3 focus:outline-none ${
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
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                    style={getBackgroundStyle(assignedUser.profileColor)}
                  >
                    {assignedUser.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-zinc-300 flex-1">
                    {assignedUser.name}
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
                      .filter(user => 
                        user.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                        user.email.toLowerCase().includes(userSearchQuery.toLowerCase())
                      )
                      .map(user => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleAssignUser(user.id)}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-700 transition-colors text-left"
                        >
                          <div 
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                            style={getBackgroundStyle(user.profileColor)}
                          >
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 text-sm">
                            <p className="font-medium">
                              {user.name}
                              {user.status === 'pending' && (
                                <span className="ml-2 text-xs text-yellow-500">(Pending)</span>
                              )}
                            </p>
                            <p className="text-xs text-zinc-500">{user.email}</p>
                          </div>
                        </button>
                      ))}
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

            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <Flag className="w-4 h-4" />
                Priority
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p as 1 | 2 | 3 | 4)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      priority === p
                        ? p === 1 
                          ? 'bg-red-500 text-white'
                          : p === 2
                          ? 'bg-[rgb(var(--theme-primary-rgb))] text-white'
                          : p === 3
                          ? 'bg-blue-500 text-white'
                          : 'bg-zinc-700 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    P{p}
                  </button>
                ))}
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
                  className="flex-1 bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
                  placeholder="Select date"
                />
                <input
                  type="time"
                  value={newReminderTime}
                  onChange={(e) => setNewReminderTime(e.target.value)}
                  className="bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
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
                <button
                  type="button"
                  onClick={() => onDelete(task.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Task
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 btn-theme-primary text-white rounded-lg transition-all"
              >
                {isEditMode ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
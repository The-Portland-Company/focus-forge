"use client"

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Archive, Trash2, Edit, Plus, Link2, Link2Off, CalendarClock, RefreshCw, CheckSquare, Square, X, Search, ArrowUpDown, User, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { Sidebar } from '@/components/sidebar'
import { filterTasksByBlockedStatus, isTaskBlocked } from '@/lib/dependency-utils'
import { AddTaskModal } from '@/components/add-task-modal'
import { BulkEditModal } from '@/components/bulk-edit-modal'
import { EditTaskModal } from '@/components/edit-task-modal'
import { AddProjectModal } from '@/components/add-project-modal'
import { EditProjectModal } from '@/components/edit-project-modal'
import { AddOrganizationModal } from '@/components/add-organization-modal'
import { EditOrganizationModal } from '@/components/edit-organization-modal'
import { ConfirmModal } from '@/components/confirm-modal'
import { TaskList } from '@/components/task-list'
import { KanbanView } from '@/components/kanban-view'
import { ColorPicker } from '@/components/color-picker'
import { Database, Task, Project, Organization, Section } from '@/lib/types'
import { SectionView } from '@/components/section-view'
import { AddSectionModal } from '@/components/add-section-modal'
import { AddSectionDivider } from '@/components/add-section-divider'
import { format } from 'date-fns'
import { getLocalDateString, isOverdue, isTodayOrOverdue, isToday, isTomorrow, isRestOfWeek } from '@/lib/date-utils'
import { applyUserTheme } from '@/lib/theme-utils'
import { TodoistQuickSyncModal } from '@/components/todoist-quick-sync-modal'
import { SkeletonSidebar, SkeletonTodayView } from '@/components/skeleton-loader'
import { useAuth } from '@/contexts/AuthContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import * as Popover from '@radix-ui/react-popover'

export default function ViewPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const view = params.view as string

  const [database, setDatabase] = useState<Database | null>(null)
  const [showTodoistSync, setShowTodoistSync] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showEditTask, setShowEditTask] = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)
  const [selectedOrgForProject, setSelectedOrgForProject] = useState<string | null>(null)
  const [showAddOrganization, setShowAddOrganization] = useState(false)
  const [showEditOrganization, setShowEditOrganization] = useState(false)
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null)
  const [showEditProject, setShowEditProject] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ show: boolean; orgId: string | null; orgName: string }>({ 
    show: false, 
    orgId: null,
    orgName: ''
  })
  const [editingOrgDescription, setEditingOrgDescription] = useState<string | null>(null)
  const [showProjectColorPicker, setShowProjectColorPicker] = useState(false)
  const [sortBy, setSortBy] = useState<'dueDate' | 'deadline' | 'priority'>('dueDate')
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>('me-unassigned')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilter, setSearchFilter] = useState<'all' | 'tasks' | 'projects' | 'organizations'>('all')
  const [showBlockedTasks, setShowBlockedTasks] = useState(false)
  const [todaySections, setTodaySections] = useState({
    overdue: true,
    today: true,
    tomorrow: true,
    restOfWeek: true
  })
  const [showAddSection, setShowAddSection] = useState(false)
  const [sectionParentId, setSectionParentId] = useState<string | undefined>(undefined)
  const [sectionOrder, setSectionOrder] = useState(0)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
  const [upcomingFilterType, setUpcomingFilterType] = useState<'dueDate' | 'deadline'>('dueDate')
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false)
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [taskSearchQuery, setTaskSearchQuery] = useState('')
  const [lastSelectedTaskId, setLastSelectedTaskId] = useState<string | null>(null)
  const [loadingTaskIds, setLoadingTaskIds] = useState<Set<string>>(new Set())
  const [animatingOutTaskIds, setAnimatingOutTaskIds] = useState<Set<string>>(new Set())
  const [undoCompletion, setUndoCompletion] = useState<{ taskId: string; taskName: string; affectedIds: string[] } | null>(null)
  const [undoExiting, setUndoExiting] = useState(false)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [optimisticCompletedIds, setOptimisticCompletedIds] = useState<Set<string>>(new Set())
  const [taskDeleteConfirm, setTaskDeleteConfirm] = useState<{ show: boolean; taskId: string | null; taskName: string }>({
    show: false,
    taskId: null,
    taskName: ''
  })

  useEffect(() => {
    fetchData()
  }, [])
  
  // Theme is now handled by AuthContext

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      if (undoHideTimerRef.current) clearTimeout(undoHideTimerRef.current)
    }
  }, [])


  const fetchData = async () => {
    try {
      const response = await fetch('/api/database', {
        credentials: 'include'
      })
      const data = await response.json()
      
      // Check if the response has an error
      if (data.error) {
        console.error('Database API error:', data.error)
        // Set a valid empty database structure to prevent runtime errors
        setDatabase({
          users: [],
          organizations: [],
          projects: [],
          tasks: [],
          tags: [],
          sections: [],
          taskSections: [],
          userSectionPreferences: [],
          settings: { showCompletedTasks: true }
        })
        return
      }
      
      // Validate that the data has the expected structure
      if (data && data.tasks && data.projects && data.organizations) {
        setDatabase(data)
        
        // Apply theme for file-based database (AuthContext handles Supabase)
        if (data.users?.[0]?.profileColor) {
          applyUserTheme(data.users[0].profileColor, data.users[0].animationsEnabled ?? true)
        }
      } else {
        console.error('Invalid database structure:', data)
        // Set a valid empty database structure
        setDatabase({
          users: [],
          organizations: [],
          projects: [],
          tasks: [],
          tags: [],
          sections: [],
          taskSections: [],
          userSectionPreferences: [],
          settings: { showCompletedTasks: true }
        })
      }
    } catch (error) {
      console.error('Error fetching database:', error)
      // Set a valid empty database structure on error
      setDatabase({
        users: [],
        organizations: [],
        projects: [],
        tasks: [],
        tags: [],
        sections: [],
        taskSections: [],
        userSectionPreferences: [],
        settings: { showCompletedTasks: true }
      })
    }
  }

  const clearUndoTimers = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    if (undoHideTimerRef.current) clearTimeout(undoHideTimerRef.current)
    undoTimerRef.current = null
    undoHideTimerRef.current = null
  }

  const showUndoCompletion = (task: Task, affectedIds: string[]) => {
    clearUndoTimers()
    setUndoCompletion({ taskId: task.id, taskName: task.name, affectedIds })
    setUndoExiting(false)
    undoTimerRef.current = setTimeout(() => {
      setUndoExiting(true)
      undoHideTimerRef.current = setTimeout(() => {
        setUndoCompletion(null)
        setUndoExiting(false)
      }, 300)
    }, 30000)
  }

  const handleUndoComplete = async () => {
    if (!undoCompletion) return
    const { affectedIds } = undoCompletion
    clearUndoTimers()
    setUndoExiting(true)
    setOptimisticCompletedIds(prev => {
      const next = new Set(prev)
      affectedIds.forEach(id => next.delete(id))
      return next
    })
    setAnimatingOutTaskIds(prev => {
      const next = new Set(prev)
      affectedIds.forEach(id => next.delete(id))
      return next
    })
    try {
      await Promise.all(
        affectedIds.map(id =>
          fetch(`/api/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              completed: false,
              completedAt: null
            })
          })
        )
      )
    } catch (error) {
      console.error('Error undoing completion:', error)
    }
    await fetchData()
    setTimeout(() => {
      setUndoCompletion(null)
      setUndoExiting(false)
    }, 250)
  }

  const handleTodoistSync = async (mode: 'merge' | 'overwrite') => {
    if (!user?.id) {
      throw new Error('User not authenticated')
    }

    const response = await fetch('/api/todoist/quick-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        userId: user.id,
        mode: mode
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Sync failed')
    }

    // Refresh data after sync
    await fetchData()
  }

  const handleAddTask = async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | Partial<Task>) => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(taskData)
      })
      
      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error creating task:', error)
    }
  }

  const handleTaskToggle = async (taskId: string) => {
    const task = database?.tasks.find(t => t.id === taskId)
    if (!task || !database) return

    const isCompleting = !task.completed
    const subtasks = database.tasks.filter(t => t.parentId === taskId)
    const affectedIds = [taskId, ...subtasks.map(st => st.id)]

    // Optimistic update - immediately show as completed
    if (isCompleting) {
      setOptimisticCompletedIds(prev => new Set(prev).add(taskId))

      // Also mark subtasks as optimistically completed
      if (subtasks.length > 0) {
        setOptimisticCompletedIds(prev => {
          const next = new Set(prev)
          subtasks.forEach(st => next.add(st.id))
          return next
        })
      }
    }

    try {
      // Update the main task
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          completed: isCompleting,
          completedAt: isCompleting ? new Date().toISOString() : undefined
        })
      })

      if (response.ok) {
        // If we're completing a parent task, also complete all subtasks
        if (isCompleting) {
          // Update all subtasks in parallel
          const updatePromises = subtasks.map(subtask =>
            fetch(`/api/tasks/${subtask.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                completed: true,
                completedAt: new Date().toISOString()
              })
            })
          )

          // Wait for all subtask updates to complete
          await Promise.all(updatePromises)

          // Start fade out animation
          setAnimatingOutTaskIds(prev => {
            const next = new Set(prev)
            next.add(taskId)
            subtasks.forEach(st => next.add(st.id))
            return next
          })

          // Wait for animation to complete
          await new Promise(resolve => setTimeout(resolve, 400))

          // Refresh data first (while still hiding the task)
          await fetchData()

          // Then clear states after data is refreshed
          setOptimisticCompletedIds(prev => {
            const next = new Set(prev)
            next.delete(taskId)
            subtasks.forEach(st => next.delete(st.id))
            return next
          })
          setAnimatingOutTaskIds(prev => {
            const next = new Set(prev)
            next.delete(taskId)
            subtasks.forEach(st => next.delete(st.id))
            return next
          })
          showUndoCompletion(task, affectedIds)
        } else {
          // Not completing, just refresh
          await fetchData()
          showUndoCompletion(task, affectedIds)
        }
      } else {
        // Revert optimistic update on failure
        if (isCompleting) {
          setOptimisticCompletedIds(prev => {
            const next = new Set(prev)
            next.delete(taskId)
            return next
          })
        }
      }
    } catch (error) {
      console.error('Error toggling task:', error)
      // Revert optimistic update on error
      if (isCompleting) {
        setOptimisticCompletedIds(prev => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
      }
    }
  }

  const handleTaskEdit = (task: Task) => {
    setEditingTask(task)
    setShowEditTask(true)
  }

  const handleTaskSave = async (taskData: Partial<Task>) => {
    if (!editingTask) return
    
    try {
      const response = await fetch(`/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(taskData)
      })
      
      if (response.ok) {
        await fetchData()
        setShowEditTask(false)
        setEditingTask(null)
      }
    } catch (error) {
      console.error('Error updating task:', error)
    }
  }

  const handleBulkUpdate = async (updates: Partial<Task>) => {
    try {
      const taskIds = Array.from(selectedTaskIds)
      setShowBulkEditModal(false)

      // Show loading state for all selected tasks
      setLoadingTaskIds(new Set(taskIds))

      // Process tasks sequentially with staggered animations
      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i]

        // Update the task
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates)
        })

        // Remove from loading, add to animating out
        setLoadingTaskIds(prev => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
        setAnimatingOutTaskIds(prev => new Set(prev).add(taskId))

        // Stagger delay between tasks (100ms)
        if (i < taskIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      // Wait for animations to complete
      await new Promise(resolve => setTimeout(resolve, 400))

      // Refresh data and reset states
      await fetchData()
      setBulkSelectMode(false)
      setSelectedTaskIds(new Set())
      setLastSelectedTaskId(null)
      setLoadingTaskIds(new Set())
      setAnimatingOutTaskIds(new Set())
    } catch (error) {
      console.error('Error bulk updating tasks:', error)
      setLoadingTaskIds(new Set())
      setAnimatingOutTaskIds(new Set())
    }
  }

  const handleBulkDelete = async () => {
    try {
      const taskIds = Array.from(selectedTaskIds)
      setShowBulkEditModal(false)

      // Show loading state for all selected tasks
      setLoadingTaskIds(new Set(taskIds))

      // Process tasks sequentially with staggered animations
      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i]

        // Delete the task
        await fetch(`/api/tasks/${taskId}`, {
          method: 'DELETE',
          credentials: 'include'
        })

        // Remove from loading, add to animating out
        setLoadingTaskIds(prev => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
        setAnimatingOutTaskIds(prev => new Set(prev).add(taskId))

        // Stagger delay between tasks (100ms)
        if (i < taskIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      // Wait for animations to complete
      await new Promise(resolve => setTimeout(resolve, 400))

      // Refresh data and reset states
      await fetchData()
      setBulkSelectMode(false)
      setSelectedTaskIds(new Set())
      setLastSelectedTaskId(null)
      setLoadingTaskIds(new Set())
      setAnimatingOutTaskIds(new Set())
    } catch (error) {
      console.error('Error bulk deleting tasks:', error)
      setLoadingTaskIds(new Set())
      setAnimatingOutTaskIds(new Set())
    }
  }

  const handleInviteUser = async (email: string, firstName: string, lastName: string): Promise<{ userId: string } | null> => {
    if (!database) return null

    // Get organization from the first selected task's project
    const firstTaskId = Array.from(selectedTaskIds)[0]
    const firstTask = database.tasks.find(t => t.id === firstTaskId)
    const projectId = firstTask ? ((firstTask as any).project_id || firstTask.projectId) : null
    const project = projectId ? database.projects.find(p => p.id === projectId) : null

    // Handle both snake_case and camelCase for organization ID
    const projectOrgId = project ? ((project as any).organization_id || project.organizationId) : null

    let organization = projectOrgId
      ? database.organizations.find(o => o.id === projectOrgId)
      : null

    // Fallback to first organization if none found from project
    if (!organization && database.organizations && database.organizations.length > 0) {
      organization = database.organizations[0]
    }

    if (!organization) {
      console.error('No organization found for invite. Organizations:', database.organizations)
      throw new Error('No organization available. Please create an organization first.')
    }

    try {
      const response = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          organizationId: organization.id,
          organizationName: organization.name
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to invite user')
      }

      // Refresh data to get the new user in the list
      await fetchData()

      if (data.user?.id) {
        return { userId: data.user.id }
      }

      return null
    } catch (error) {
      console.error('Error inviting user:', error)
      throw error
    }
  }

  const handleTaskDelete = async (taskId: string) => {
    if (showEditTask) {
      setShowEditTask(false)
      setEditingTask(null)
    }
    const task = database?.tasks.find(t => t.id === taskId)
    setTaskDeleteConfirm({
      show: true,
      taskId,
      taskName: task?.name || 'this task'
    })
  }

  const confirmTaskDelete = async () => {
    if (!taskDeleteConfirm.taskId) return
    try {
      const response = await fetch(`/api/tasks/${taskDeleteConfirm.taskId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error deleting task:', error)
    }
  }


  const handleViewChange = (newView: string) => {
    router.push(`/${newView}`)
  }

  const handleProjectUpdate = async (projectId: string, updates: Partial<Project>) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      })
      
      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error updating project:', error)
    }
  }

  const handleProjectDelete = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      
      if (response.ok) {
        await fetchData()
        // If we're currently viewing the deleted project, go to today view
        if (view === `project-${projectId}`) {
          router.push('/today')
        }
      }
    } catch (error) {
      console.error('Error deleting project:', error)
    }
  }

  const handleAddProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(projectData)
      })
      
      if (response.ok) {
        await fetchData()
        setShowAddProject(false)
        setSelectedOrgForProject(null)
      }
    } catch (error) {
      console.error('Error creating project:', error)
    }
  }

  const handleOpenAddProject = (organizationId: string) => {
    setSelectedOrgForProject(organizationId)
    setShowAddProject(true)
  }

  const handleOpenAddProjectGeneral = () => {
    setSelectedOrgForProject(database?.organizations[0]?.id || null)
    setShowAddProject(true)
  }

  const handleAddOrganization = async (orgData: { name: string; color: string }) => {
    try {
      // Include the current user as owner and initial member
      const currentUserId = database?.users?.[0]?.id
      const organizationData = {
        ...orgData,
        ownerId: currentUserId,
        memberIds: currentUserId ? [currentUserId] : []
      }
      
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(organizationData)
      })
      
      if (response.ok) {
        await fetchData()
        setShowAddOrganization(false)
      }
    } catch (error) {
      console.error('Error creating organization:', error)
    }
  }

  const handleOrganizationDelete = async (orgId: string) => {
    if (!confirmDelete.orgId) return
    
    try {
      const response = await fetch(`/api/organizations/${orgId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      
      if (response.ok) {
        await fetchData()
        // If we're currently viewing the deleted organization, go to today view
        if (view === `org-${orgId}`) {
          router.push('/today')
        }
      }
    } catch (error) {
      console.error('Error deleting organization:', error)
    }
  }

  const openDeleteConfirmation = (orgId: string) => {
    const org = database?.organizations.find(o => o.id === orgId)
    if (org) {
      const projectCount = database?.projects.filter(p => p.organizationId === orgId).length || 0
      const taskCount = database?.tasks.filter(t => {
        const projectId = (t as any).project_id || t.projectId
        const project = database?.projects.find(p => p.id === projectId)
        return project?.organizationId === orgId
      }).length || 0
      
      setConfirmDelete({
        show: true,
        orgId: orgId,
        orgName: `${org.name} (${projectCount} projects, ${taskCount} tasks)`
      })
    }
  }

  const handleOrganizationUpdate = async (orgId: string, updates: Partial<Organization>) => {
    try {
      const response = await fetch(`/api/organizations/${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      })
      
      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error updating organization:', error)
    }
  }

  const handleOrganizationArchive = async (orgId: string) => {
    if (!database) return
    
    const org = database.organizations.find(o => o.id === orgId)
    if (!org) return
    
    // Archive all projects in this organization
    const projectsToArchive = database.projects.filter(p => p.organizationId === orgId && !p.archived)
    
    try {
      // Archive each project
      for (const project of projectsToArchive) {
        await fetch(`/api/projects/${project.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ archived: true })
        })
      }
      
      // Refresh the data
      await fetchData()
    } catch (error) {
      console.error('Error archiving organization projects:', error)
    }
  }

  const handleOpenEditOrganization = (orgId: string) => {
    const org = database?.organizations.find(o => o.id === orgId)
    if (org) {
      setEditingOrganization(org)
      setShowEditOrganization(true)
    }
  }

  const handleOpenEditProject = (projectId: string) => {
    const project = database?.projects.find(p => p.id === projectId)
    if (project) {
      setEditingProject(project)
      setShowEditProject(true)
    }
  }
  
  const handleProjectsReorder = async (organizationId: string, projectIds: string[]) => {
    try {
      const response = await fetch('/api/projects/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ organizationId, projectIds })
      })
      
      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error reordering projects:', error)
    }
  }
  
  const handleOrganizationsReorder = async (organizationIds: string[]) => {
    try {
      const response = await fetch('/api/organizations/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ organizationIds })
      })
      
      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error reordering organizations:', error)
    }
  }

  const handleAddSection = async (section: Omit<Section, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(section)
      })
      
      if (response.ok) {
        await fetchData()
        setShowAddSection(false)
      }
    } catch (error) {
      console.error('Error creating section:', error)
    }
  }

  const handleSectionEdit = (section: Section) => {
    setEditingSection(section)
    // TODO: Open edit modal
  }

  const handleSectionDelete = async (sectionId: string) => {
    const section = database?.sections?.find(s => s.id === sectionId)
    if (!section) return
    
    // Count tasks in this section
    const tasksInSection = database?.taskSections?.filter(ts => ts.sectionId === sectionId).length || 0
    
    const confirmMessage = tasksInSection > 0
      ? `Are you sure you want to delete "${section.name}"? This section contains ${tasksInSection} task(s). They can be moved to "Unassigned" or deleted.`
      : `Are you sure you want to delete "${section.name}"?`
    
    if (confirm(confirmMessage)) {
      if (tasksInSection > 0) {
        const action = confirm('Click OK to delete the tasks, or Cancel to move them to "Unassigned"')
        // TODO: Implement task handling based on user choice
      }
      
      try {
        const response = await fetch(`/api/sections/${sectionId}`, {
          method: 'DELETE',
          credentials: 'include'
        })
        
        if (response.ok) {
          await fetchData()
        }
      } catch (error) {
        console.error('Error deleting section:', error)
      }
    }
  }

  const handleTaskDropToSection = async (taskId: string, sectionId: string) => {
    try {
      const response = await fetch('/api/task-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId, sectionId })
      })
      
      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error adding task to section:', error)
    }
  }

  const handleSectionReorder = async (sectionId: string, newOrder: number) => {
    try {
      const response = await fetch(`/api/sections/${sectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order: newOrder })
      })
      
      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error reordering section:', error)
    }
  }

  const openAddSection = (projectId: string, parentId?: string, order?: number) => {
    setSectionParentId(parentId)
    setSectionOrder(order || 0)
    setShowAddSection(true)
  }

  if (!database) {
    return (
      <div className="h-screen bg-zinc-950 flex">
        <SkeletonSidebar />
        <main className="flex-1 text-white overflow-y-auto">
          <SkeletonTodayView />
        </main>
      </div>
    )
  }

  const sortTasks = (tasks: Task[]) => {
    return [...tasks].sort((a, b) => {
      switch (sortBy) {
        case 'dueDate':
          // Handle both snake_case and camelCase fields
          const aDueDate = (a as any).due_date || a.dueDate
          const bDueDate = (b as any).due_date || b.dueDate
          if (!aDueDate && !bDueDate) return 0
          if (!aDueDate) return 1
          if (!bDueDate) return -1
          return new Date(aDueDate).getTime() - new Date(bDueDate).getTime()
        
        case 'deadline':
          if (!a.deadline && !b.deadline) return 0
          if (!a.deadline) return 1
          if (!b.deadline) return -1
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        
        case 'priority':
          return a.priority - b.priority // Lower number = higher priority
        
        default:
          return 0
      }
    })
  }

  const getCurrentUserId = () => {
    // Get the first user as the current user (in a real app this would come from auth)
    return database?.users[0]?.id || null
  }

  // Get current user's priority color preference
  const getCurrentUserPriorityColor = () => {
    if (!database?.users || !user?.id) return undefined
    const currentUser = database.users.find(u => u.id === user.id)
    return (currentUser as any)?.priorityColor || (currentUser as any)?.priority_color || undefined
  }

  const userPriorityColor = getCurrentUserPriorityColor()

  const filterTasks = (tasks: Task[]) => {
    if (filterAssignedTo === 'all') {
      return tasks
    }
    
    const currentUserId = getCurrentUserId()
    
    if (filterAssignedTo === 'me-unassigned' && currentUserId) {
      return tasks.filter(task => {
        const assignedTo = (task as any).assigned_to || task.assignedTo
        return assignedTo === currentUserId || !assignedTo
      })
    }
    
    if (filterAssignedTo === 'me' && currentUserId) {
      return tasks.filter(task => {
        const assignedTo = (task as any).assigned_to || task.assignedTo
        return assignedTo === currentUserId
      })
    }
    
    if (filterAssignedTo === 'unassigned') {
      return tasks.filter(task => {
        const assignedTo = (task as any).assigned_to || task.assignedTo
        return !assignedTo
      })
    }
    
    // Filter by specific user ID
    return tasks.filter(task => {
      const assignedTo = (task as any).assigned_to || task.assignedTo
      return assignedTo === filterAssignedTo
    })
  }

  const renderContent = () => {
    if (view === 'today') {
      // Get all tasks with due dates up to end of week
      let allWeekTasks = database.tasks.filter(task => {
        const dueDate = (task as any).due_date || task.dueDate
        if (!dueDate) return false
        // Include overdue, today, tomorrow, and rest of week
        return isOverdue(dueDate) || isToday(dueDate) || isTomorrow(dueDate) || isRestOfWeek(dueDate)
      })

      // Apply filters and sorting
      allWeekTasks = filterTasks(allWeekTasks)
      allWeekTasks = sortTasks(allWeekTasks)

      // Filter blocked tasks if needed
      if (!showBlockedTasks && database) {
        allWeekTasks = filterTasksByBlockedStatus(allWeekTasks, database.tasks, showBlockedTasks)
      }

      // Apply search filter
      if (taskSearchQuery.trim()) {
        const query = taskSearchQuery.toLowerCase()
        allWeekTasks = allWeekTasks.filter(task =>
          task.name.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
        )
      }

      // Group tasks by section
      const completedWeekTasks = allWeekTasks.filter(task => task.completed)
      const activeWeekTasks = allWeekTasks.filter(task => !task.completed)

      const overdueTasks = activeWeekTasks.filter(task => {
        const dueDate = (task as any).due_date || task.dueDate
        return dueDate && isOverdue(dueDate)
      })

      const todayTasks = activeWeekTasks.filter(task => {
        const dueDate = (task as any).due_date || task.dueDate
        return dueDate && isToday(dueDate)
      })

      const tomorrowTasks = activeWeekTasks.filter(task => {
        const dueDate = (task as any).due_date || task.dueDate
        return dueDate && isTomorrow(dueDate)
      })

      const restOfWeekTasks = activeWeekTasks.filter(task => {
        const dueDate = (task as any).due_date || task.dueDate
        return dueDate && isRestOfWeek(dueDate)
      })

      // Count overdue tasks specifically (for reschedule button)
      const overdueCount = overdueTasks.filter(t => !t.completed).length

      // Toggle section expansion
      const toggleSection = (section: keyof typeof todaySections) => {
        setTodaySections(prev => ({ ...prev, [section]: !prev[section] }))
      }

      // Section header component
      const SectionHeader = ({ title, count, section, isOpen }: { title: string, count: number, section: keyof typeof todaySections, isOpen: boolean }) => (
        <button
          onClick={() => toggleSection(section)}
          className="w-full flex items-center justify-between py-2 px-1 border-b border-zinc-700 group"
        >
          <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-400 transition-colors">
            {title} {count > 0 && <span className="text-zinc-600">({count})</span>}
          </span>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-zinc-600 group-hover:text-zinc-500 transition-colors" />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-600 group-hover:text-zinc-500 transition-colors" />
          )}
        </button>
      )

      const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
        setDatabase(prev => {
          if (!prev) return prev
          const updatesAny = updates as any
          return {
            ...prev,
            tasks: prev.tasks.map(task => {
              if (task.id !== taskId) return task
              const hasDueDate = Object.prototype.hasOwnProperty.call(updatesAny, 'due_date') || Object.prototype.hasOwnProperty.call(updatesAny, 'dueDate')
              const hasDueTime = Object.prototype.hasOwnProperty.call(updatesAny, 'due_time') || Object.prototype.hasOwnProperty.call(updatesAny, 'dueTime')
              const nextDueDate = hasDueDate ? (updatesAny.due_date ?? updatesAny.dueDate ?? null) : ((task as any).due_date ?? task.dueDate ?? null)
              const nextDueTime = hasDueTime ? (updatesAny.due_time ?? updatesAny.dueTime ?? null) : ((task as any).due_time ?? task.dueTime ?? null)
              return {
                ...task,
                ...updates,
                dueDate: nextDueDate ?? undefined,
                dueTime: nextDueTime ?? undefined,
                due_date: nextDueDate,
                due_time: nextDueTime
              } as any
            })
          }
        })
        try {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates)
          })

          if (response.ok) {
            await fetchData()
          } else {
            await fetchData()
          }
        } catch (error) {
          console.error('Error updating task:', error)
          await fetchData()
        }
      }

      // Common TaskList props
      const getTaskListProps = (tasks: typeof allWeekTasks, accordionKey: string) => ({
        tasks,
        allTasks: database.tasks,
        projects: database.projects,
        currentUserId: user?.id,
        priorityColor: userPriorityColor,
        showCompleted: database.settings?.showCompletedTasks ?? true,
        completedAccordionKey: accordionKey,
        revealActionsOnHover: true,
        uniformDueBadgeWidth: true,
        onTaskToggle: handleTaskToggle,
        onTaskEdit: handleTaskEdit,
        onTaskDelete: handleTaskDelete,
        onTaskUpdate: handleTaskUpdate,
        enableDueDateQuickEdit: true,
        bulkSelectMode,
        selectedTaskIds,
        loadingTaskIds,
        animatingOutTaskIds,
        optimisticCompletedIds,
        onTaskSelect: (taskId: string, event?: React.MouseEvent) => {
          if (event?.ctrlKey || event?.metaKey) {
            setSelectedTaskIds(prev => {
              const next = new Set(prev)
              next.delete(taskId)
              return next
            })
            return
          }
          if (event?.shiftKey && lastSelectedTaskId) {
            const taskIds = allWeekTasks.map(t => t.id)
            const lastIndex = taskIds.indexOf(lastSelectedTaskId)
            const currentIndex = taskIds.indexOf(taskId)
            if (lastIndex !== -1 && currentIndex !== -1) {
              const start = Math.min(lastIndex, currentIndex)
              const end = Math.max(lastIndex, currentIndex)
              const rangeIds = taskIds.slice(start, end + 1)
              setSelectedTaskIds(prev => {
                const next = new Set(prev)
                rangeIds.forEach(id => next.add(id))
                return next
              })
              return
            }
          }
          setSelectedTaskIds(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) {
              next.delete(taskId)
            } else {
              next.add(taskId)
            }
            return next
          })
          setLastSelectedTaskId(taskId)
        }
      })

      const todayDate = new Date()
      const todayLabel = `${format(todayDate, 'EEE')}. ${format(todayDate, 'MMM')}. ${format(todayDate, 'do')} '${format(todayDate, 'yy')}`

      return (
        <div className="relative">
          {/* Header bar */}
          <div className="sticky top-0 z-40 w-full bg-zinc-900 border-b border-zinc-800">
            <div className="w-full px-4 py-4">
              <div className="flex items-center justify-between gap-4 overflow-x-auto">
                <div className="flex items-center gap-4 shrink-0">
                  <div className="px-4 py-1 bg-zinc-800 border border-zinc-700">
                    <span className="text-sm font-medium text-zinc-300">
                      {todayLabel}
                    </span>
                  </div>
                </div>
                <div className="relative flex items-center flex-1 min-w-[220px] max-w-[360px]">
                  <Search className="absolute left-3 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={taskSearchQuery}
                    onChange={(e) => setTaskSearchQuery(e.target.value)}
                    placeholder="Search tasks..."
                    className="bg-zinc-800 text-white text-sm pl-9 pr-3 py-1.5 rounded border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all w-full"
                  />
                  {taskSearchQuery && (
                    <button
                      onClick={() => setTaskSearchQuery('')}
                      className="absolute right-2 text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end gap-4 shrink-0">
                  <div className="flex items-center gap-2">
                    {user && (
                      <span className="relative group/todoist">
                        <button
                          onClick={() => setShowTodoistSync(true)}
                          className="p-2.5 hover:bg-zinc-800 rounded-lg transition-colors text-red-500 hover:text-red-400"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <span className="absolute right-0 top-full mt-1 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/todoist:opacity-100 transition-opacity pointer-events-none z-50">
                          Sync with Todoist
                        </span>
                      </span>
                    )}
                    {overdueCount > 0 && (
                      <span className="relative group/reschedule">
                        <button
                          onClick={() => setShowRescheduleConfirm(true)}
                          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-orange-400 hover:text-orange-300"
                        >
                          <CalendarClock className="w-5 h-5" />
                        </button>
                        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/reschedule:opacity-100 transition-opacity pointer-events-none z-50">
                          Reschedule {overdueCount} overdue task{overdueCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          className="p-2 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                          aria-label="Sort options"
                        >
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          side="bottom"
                          align="center"
                          sideOffset={8}
                          className="z-50 w-44 rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl p-2"
                        >
                          <div className="text-[11px] text-zinc-500 px-1 pb-1">Sort by</div>
                          <Select
                            value={sortBy}
                            onValueChange={(value) => setSortBy(value as typeof sortBy)}
                          >
                            <SelectTrigger className="h-8 w-full bg-zinc-800 text-white text-sm border border-zinc-700">
                              <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dueDate">Due Date</SelectItem>
                              <SelectItem value="deadline">Deadline</SelectItem>
                              <SelectItem value="priority">Priority</SelectItem>
                            </SelectContent>
                          </Select>
                          <Popover.Arrow className="fill-zinc-900 stroke-zinc-800" width={10} height={6} />
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="relative group/assign">
                      <User className="w-4 h-4 text-zinc-400" />
                      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/assign:opacity-100 transition-opacity pointer-events-none z-50">
                        Assigned to
                      </span>
                    </span>
                    <Select
                      value={filterAssignedTo}
                      onValueChange={(value) => setFilterAssignedTo(value)}
                    >
                      <SelectTrigger className="h-8 w-[170px] bg-zinc-800 text-white text-sm border border-zinc-700">
                        <SelectValue placeholder="Assigned to" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="me-unassigned">Me + Unassigned</SelectItem>
                        <SelectItem value="me">Me</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {database.users.map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.firstName} {user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <span className="relative group/blocked">
                    <button
                      onClick={() => setShowBlockedTasks(!showBlockedTasks)}
                      className={`p-2 rounded border transition-colors ${
                        showBlockedTasks
                          ? 'bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600'
                      }`}
                    >
                      {showBlockedTasks ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
                    </button>
                    <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/blocked:opacity-100 transition-opacity pointer-events-none z-50">
                      {showBlockedTasks ? 'Currently Showing Blocked Tasks' : 'Currently Hiding Blocked Tasks'}
                    </span>
                  </span>

                  <span className="relative group/bulk">
                    <button
                      onClick={() => {
                        if (bulkSelectMode) {
                          setBulkSelectMode(false)
                          setSelectedTaskIds(new Set())
                          setLastSelectedTaskId(null)
                        } else {
                          setBulkSelectMode(true)
                        }
                      }}
                      className={`p-2 rounded border transition-colors ${
                        bulkSelectMode
                          ? 'bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600'
                      }`}
                    >
                      {bulkSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                    <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/bulk:opacity-100 transition-opacity pointer-events-none z-50">
                      {bulkSelectMode ? 'Cancel Bulk Select' : 'Bulk Select'}
                    </span>
                  </span>

                  {bulkSelectMode && selectedTaskIds.size > 0 && (
                    <button
                      onClick={() => setShowBulkEditModal(true)}
                      className="px-3 py-1.5 rounded border bg-[rgb(var(--theme-primary-rgb))] text-white border-[rgb(var(--theme-primary-rgb))] hover:bg-[rgb(var(--theme-primary-rgb))]/80 transition-colors text-sm font-medium"
                    >
                      Apply to {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Task List with dark container - Grouped by time period */}
          <div className="w-full pb-8 pt-6">
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2 mx-4">
              {/* Overdue Section */}
              {overdueTasks.length > 0 && (
                <div>
                  <SectionHeader
                    title="Overdue"
                    count={overdueTasks.filter(t => !t.completed).length}
                    section="overdue"
                    isOpen={todaySections.overdue}
                  />
                  {todaySections.overdue && (
                    <div className="mt-1">
                      <TaskList {...getTaskListProps(overdueTasks, 'today-overdue')} />
                    </div>
                  )}
                </div>
              )}

              {/* Today Section */}
              <div>
                <SectionHeader
                  title="Today"
                  count={todayTasks.filter(t => !t.completed).length}
                  section="today"
                  isOpen={todaySections.today}
                />
                {todaySections.today && (
                  <div className="mt-1">
                    {todayTasks.length > 0 ? (
                      <TaskList {...getTaskListProps(todayTasks, 'today-today')} />
                    ) : (
                      <p className="text-sm text-zinc-600 py-2 px-1">No tasks due today</p>
                    )}
                  </div>
                )}
              </div>

              {/* Tomorrow Section */}
              <div>
                <SectionHeader
                  title="Tomorrow"
                  count={tomorrowTasks.filter(t => !t.completed).length}
                  section="tomorrow"
                  isOpen={todaySections.tomorrow}
                />
                {todaySections.tomorrow && (
                  <div className="mt-1">
                    {tomorrowTasks.length > 0 ? (
                      <TaskList {...getTaskListProps(tomorrowTasks, 'today-tomorrow')} />
                    ) : (
                      <p className="text-sm text-zinc-600 py-2 px-1">No tasks due tomorrow</p>
                    )}
                  </div>
                )}
              </div>

              {/* Rest of Week Section */}
              <div>
                <SectionHeader
                  title="Rest of the Week"
                  count={restOfWeekTasks.filter(t => !t.completed).length}
                  section="restOfWeek"
                  isOpen={todaySections.restOfWeek}
                />
                {todaySections.restOfWeek && (
                  <div className="mt-1">
                    {restOfWeekTasks.length > 0 ? (
                      <TaskList {...getTaskListProps(restOfWeekTasks, 'today-restofweek')} />
                    ) : (
                      <p className="text-sm text-zinc-600 py-2 px-1">No tasks for the rest of the week</p>
                    )}
                  </div>
                )}
              </div>
              
              {completedWeekTasks.length > 0 && (
                <div className="mt-4">
                  <TaskList
                    {...getTaskListProps(completedWeekTasks, 'today-completed')}
                    showCompleted={false}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
    
    if (view === 'upcoming') {
      // Filter tasks based on selected date type
      let upcomingTasks = database.tasks.filter(task => {
        if (task.completed) return false
        if (upcomingFilterType === 'dueDate') {
          // Handle both snake_case and camelCase fields
          const dueDate = (task as any).due_date || task.dueDate
          return dueDate !== null && dueDate !== undefined
        } else {
          return task.deadline !== null && task.deadline !== undefined
        }
      })
      
      // Filter blocked tasks if needed
      if (!showBlockedTasks && database) {
        upcomingTasks = filterTasksByBlockedStatus(upcomingTasks, database.tasks, showBlockedTasks)
      }
      
      const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
        try {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates)
          })
          
          if (response.ok) {
            await fetchData()
          }
        } catch (error) {
          console.error('Error updating task:', error)
        }
      }
      
      return (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Upcoming</h1>
              <div className="px-4 py-1 rounded-lg bg-gradient-to-r from-zinc-800/80 to-zinc-700/80 backdrop-filter backdrop-blur-xl border border-zinc-600/30">
                <span className="text-sm font-medium text-zinc-300">
                  Next 7 Days
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Date Filter Toggle */}
              <div className="flex bg-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => setUpcomingFilterType('dueDate')}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    upcomingFilterType === 'dueDate'
                      ? 'bg-theme-gradient text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Due Date
                </button>
                <button
                  onClick={() => setUpcomingFilterType('deadline')}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    upcomingFilterType === 'deadline'
                      ? 'bg-theme-gradient text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Deadline
                </button>
              </div>
              
              {/* Blocked Tasks Toggle */}
              <span className="relative group/blocked">
                <button
                  onClick={() => setShowBlockedTasks(!showBlockedTasks)}
                  className={`p-2 rounded border transition-colors ${
                    showBlockedTasks
                      ? 'bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600'
                  }`}
                >
                  {showBlockedTasks ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/blocked:opacity-100 transition-opacity pointer-events-none z-50">
                  {showBlockedTasks ? 'Currently Showing Blocked Tasks' : 'Currently Hiding Blocked Tasks'}
                </span>
              </span>
            </div>
          </div>
          <KanbanView
            tasks={upcomingTasks}
            allTasks={database.tasks}
            projects={database.projects}
            onTaskToggle={handleTaskToggle}
            onTaskEdit={handleTaskEdit}
            onTaskUpdate={handleTaskUpdate}
            dateType={upcomingFilterType}
          />
        </div>
      )
    }
    
    if (view === 'search') {
      // Filter tasks based on search query
      const filteredTasks = database.tasks.filter(task => {
        const query = searchQuery.toLowerCase()
        return (
          task.name.toLowerCase().includes(query) ||
          (task.description && task.description.toLowerCase().includes(query)) ||
          (task.tags && task.tags.some(tag => tag.toLowerCase().includes(query)))
        )
      })
      
      // Filter projects based on search query
      const filteredProjects = database.projects.filter(project => {
        const query = searchQuery.toLowerCase()
        return (
          project.name.toLowerCase().includes(query) ||
          (project.description && project.description.toLowerCase().includes(query))
        )
      })
      
      // Filter organizations based on search query
      const filteredOrganizations = database.organizations.filter(org => {
        const query = searchQuery.toLowerCase()
        return (
          org.name.toLowerCase().includes(query) ||
          (org.description && org.description.toLowerCase().includes(query))
        )
      })
      
      return (
        <div>
          <h1 className="text-2xl font-bold mb-6">Search</h1>
          
          {/* Search Input */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search tasks, projects, and organizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:ring-2 ring-theme focus:border-transparent"
              autoFocus
            />
          </div>
          
          {/* Search Filters */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setSearchFilter('all')}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === 'all' 
                  ? 'bg-theme-primary text-white' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSearchFilter('tasks')}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === 'tasks' 
                  ? 'bg-theme-primary text-white' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              Tasks ({filteredTasks.length})
            </button>
            <button
              onClick={() => setSearchFilter('projects')}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === 'projects' 
                  ? 'bg-theme-primary text-white' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              Projects ({filteredProjects.length})
            </button>
            <button
              onClick={() => setSearchFilter('organizations')}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === 'organizations' 
                  ? 'bg-theme-primary text-white' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              Organizations ({filteredOrganizations.length})
            </button>
          </div>
          
          {/* Search Results */}
          <div className="space-y-6">
            {/* Tasks Results */}
            {(searchFilter === 'all' || searchFilter === 'tasks') && filteredTasks.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Tasks</h2>
                <TaskList
                  tasks={filteredTasks}
                  allTasks={database.tasks}
                  projects={database.projects}
                  currentUserId={user?.id}
                  priorityColor={userPriorityColor}
                  showCompleted={database.settings?.showCompletedTasks ?? true}
                  completedAccordionKey="search"
                  onTaskToggle={handleTaskToggle}
                  onTaskEdit={handleTaskEdit}
                  onTaskDelete={handleTaskDelete}
                />
              </div>
            )}
            
            {/* Projects Results */}
            {(searchFilter === 'all' || searchFilter === 'projects') && filteredProjects.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Projects</h2>
                <div className="grid gap-3">
                  {filteredProjects.map(project => {
                    const org = database.organizations.find(o => o.id === project.organizationId)
                    const taskCount = database.tasks.filter(t => ((t as any).project_id || t.projectId) === project.id).length
                    
                    return (
                      <Link
                        key={project.id}
                        href={`/project-${project.id}`}
                        className="block p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: project.color }} 
                          />
                          <div className="flex-1">
                            <h3 className="font-medium">{project.name}</h3>
                            {project.description && (
                              <p className="text-sm text-zinc-400 mt-1">{project.description}</p>
                            )}
                            <p className="text-xs text-zinc-500 mt-1">
                              {org?.name} • {taskCount} tasks
                            </p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* Organizations Results */}
            {(searchFilter === 'all' || searchFilter === 'organizations') && filteredOrganizations.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Organizations</h2>
                <div className="grid gap-3">
                  {filteredOrganizations.map(org => {
                    const projectCount = database.projects.filter(p => p.organizationId === org.id).length
                    
                    return (
                      <Link
                        key={org.id}
                        href={`/org-${org.id}`}
                        className="block p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-lg flex-shrink-0" 
                            style={{ backgroundColor: org.color }} 
                          />
                          <div className="flex-1">
                            <h3 className="font-medium">{org.name}</h3>
                            {org.description && (
                              <p className="text-sm text-zinc-400 mt-1">{org.description}</p>
                            )}
                            <p className="text-xs text-zinc-500 mt-1">
                              {projectCount} projects
                            </p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* No Results */}
            {searchQuery && 
             filteredTasks.length === 0 && 
             filteredProjects.length === 0 && 
             filteredOrganizations.length === 0 && (
              <p className="text-zinc-400 text-center py-8">
                No results found for &quot;{searchQuery}&quot;
              </p>
            )}
            
            {/* Empty State */}
            {!searchQuery && (
              <p className="text-zinc-400 text-center py-8">
                Start typing to search across your tasks, projects, and organizations
              </p>
            )}
          </div>
        </div>
      )
    }
    
    if (view === 'favorites') {
      return (
        <div>
          <h1 className="text-2xl font-bold mb-6">Favorites</h1>
          <p className="text-zinc-400">Your favorite projects will appear here</p>
        </div>
      )
    }
    
    if (view.startsWith('org-')) {
      const orgId = view.replace('org-', '')
      const organization = database.organizations.find(o => o.id === orgId)
      const orgProjects = database.projects.filter(p => p.organizationId === orgId)
      const activeProjects = orgProjects.filter(p => !p.archived)
      const archivedProjects = orgProjects.filter(p => p.archived)
      
      return (
        <div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold">{organization?.name || 'Organization'}</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEditOrganization(orgId)}
                  className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                  title="Edit organization"
                >
                  <Edit className="w-5 h-5" />
                </button>
                {organization?.archived ? (
                  <button
                    onClick={() => handleOrganizationUpdate(orgId, { archived: false })}
                    className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                    title="Restore organization"
                  >
                    <Archive className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleOrganizationUpdate(orgId, { archived: true })}
                    className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                    title="Archive organization"
                  >
                    <Archive className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => openDeleteConfirmation(orgId)}
                  className="p-2 hover:bg-zinc-800 rounded transition-colors text-red-400 hover:text-red-300"
                  title="Delete organization"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <p className="text-zinc-400 mb-4">
              {activeProjects.length} active projects, {archivedProjects.length} archived
            </p>
            
            {editingOrgDescription === orgId ? (
              <textarea
                value={organization?.description || ''}
                onChange={(e) => {
                  handleOrganizationUpdate(orgId, { description: e.target.value })
                }}
                onBlur={() => setEditingOrgDescription(null)}
                placeholder="Add a description..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 ring-theme transition-all"
                rows={3}
                autoFocus
              />
            ) : (
              <div
                onClick={() => setEditingOrgDescription(orgId)}
                className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-300 p-3 bg-zinc-800/50 rounded-lg border border-transparent hover:border-zinc-700"
              >
                {organization?.description || 'Click to add description...'}
              </div>
            )}
          </div>
          
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold mb-4">Active Projects</h2>
              <div className="grid gap-4">
                {activeProjects.map(project => {
                  const taskCount = database.tasks.filter(t => ((t as any).project_id || t.projectId) === project.id).length
                  const completedCount = database.tasks.filter(t => ((t as any).project_id || t.projectId) === project.id && t.completed).length
                  
                  return (
                    <div key={project.id} className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                      <div className="flex items-start justify-between mb-2">
                        <Link
                          href={`/project-${project.id}`}
                          className="flex items-center gap-2 text-lg font-medium hover:text-zinc-300 transition-colors"
                        >
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                          {project.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleProjectUpdate(project.id, { archived: false })}
                            className="p-1 hover:bg-zinc-800 rounded transition-colors"
                            title="Unarchive project"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${project.name}"? This will also delete all tasks in this project.`)) {
                                handleProjectDelete(project.id)
                              }
                            }}
                            className="p-1 hover:bg-zinc-800 rounded transition-colors text-red-400"
                            title="Delete project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {project.description && (
                        <p className="text-sm text-zinc-400 mb-2">{project.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-zinc-500">
                        <span>{taskCount} tasks ({completedCount} completed)</span>
                        {project.budget && <span>Budget: ${project.budget}</span>}
                        {project.deadline && <span>Deadline: {new Date(project.deadline).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  )
                })}
                {activeProjects.length === 0 && (
                  <p className="text-zinc-500">No active projects</p>
                )}
              </div>
            </div>
            
            {archivedProjects.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 text-zinc-400">Archived Projects</h2>
                <div className="grid gap-4">
                  {archivedProjects.map(project => {
                    const taskCount = database.tasks.filter(t => ((t as any).project_id || t.projectId) === project.id).length
                    
                    return (
                      <div key={project.id} className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800 opacity-60">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 text-lg font-medium">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                            {project.name}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleProjectUpdate(project.id, { archived: false })}
                              className="p-1 hover:bg-zinc-800 rounded transition-colors"
                              title="Restore project"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Are you sure you want to permanently delete "${project.name}"? This will also delete all tasks in this project.`)) {
                                  handleProjectDelete(project.id)
                                }
                              }}
                              className="p-1 hover:bg-zinc-800 rounded transition-colors text-red-400"
                              title="Delete project permanently"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-zinc-500">
                          <span>{taskCount} tasks</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }
    
    if (view.startsWith('project-')) {
      const projectId = view.replace('project-', '')
      const project = database.projects.find(p => p.id === projectId)
      const projectTasks = database.tasks.filter(t => ((t as any).project_id || t.projectId) === projectId)
      const projectSections = database.sections?.filter(s => s.projectId === projectId && !s.parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0)) || []
      
      // Get tasks that are not in any section
      const unassignedTasks = projectTasks.filter(task => {
        const taskSections = database.taskSections?.filter(ts => ts.taskId === task.id) || []
        return taskSections.length === 0
      })
      
      const currentUserId = database.users[0]?.id || ''
      
      return (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="relative">
                <span 
                  className="w-4 h-4 rounded-full block cursor-pointer hover:ring-2 hover:ring-zinc-400 transition-all" 
                  style={{ backgroundColor: project?.color }}
                  onMouseEnter={() => setShowProjectColorPicker(true)}
                  onMouseLeave={() => setShowProjectColorPicker(false)}
                ></span>
                {showProjectColorPicker && project && (
                  <div onMouseEnter={() => setShowProjectColorPicker(true)} onMouseLeave={() => setShowProjectColorPicker(false)}>
                    <ColorPicker
                      currentColor={project.color}
                      onColorChange={(color) => {
                        handleProjectUpdate(project.id, { color })
                        setShowProjectColorPicker(false)
                      }}
                      onClose={() => setShowProjectColorPicker(false)}
                    />
                  </div>
                )}
              </div>
              {project?.name || 'Project'}
            </h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAddTask(true)}
                className="btn-theme-primary text-white rounded-lg px-3 py-2 flex items-center gap-2 text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4" />
                Task
              </button>
              <span className="text-sm text-zinc-400">
                {projectTasks.filter(t => !t.completed).length} active, {projectTasks.filter(t => t.completed).length} completed
              </span>
            </div>
          </div>
          
          {/* Add Section divider at the top */}
          <AddSectionDivider
            onClick={() => openAddSection(projectId, undefined, 0)}
          />
          
          {/* Sections */}
          {projectSections.map((section, index) => (
            <div key={section.id}>
              <SectionView
                section={section}
                tasks={projectTasks}
                allTasks={database.tasks}
                database={database}
                priorityColor={userPriorityColor}
                completedAccordionKey={`project-${projectId}`}
                onTaskToggle={handleTaskToggle}
                onTaskEdit={handleTaskEdit}
                onTaskDelete={handleTaskDelete}
                onSectionEdit={handleSectionEdit}
                onSectionDelete={handleSectionDelete}
                onAddSection={(parentId) => openAddSection(projectId, parentId)}
                onTaskDrop={handleTaskDropToSection}
                onSectionReorder={handleSectionReorder}
                userId={currentUserId}
              />
              
              {/* Add Section divider between sections */}
              <AddSectionDivider
                onClick={() => openAddSection(projectId, undefined, (section.order || 0) + 1)}
              />
            </div>
          ))}
          
          {/* Unassigned tasks */}
          {unassignedTasks.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium text-zinc-400 mb-3">Unassigned Tasks</h3>
              <TaskList
                tasks={unassignedTasks}
                allTasks={database.tasks}
                projects={database.projects}
                currentUserId={user?.id}
                priorityColor={userPriorityColor}
                showCompleted={database.settings?.showCompletedTasks ?? true}
                completedAccordionKey={`project-${projectId}-unassigned`}
                onTaskToggle={handleTaskToggle}
                onTaskEdit={handleTaskEdit}
                onTaskDelete={handleTaskDelete}
              />
            </div>
          )}
          
          {/* Add Section divider at the bottom if there are unassigned tasks */}
          {unassignedTasks.length === 0 && projectSections.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              <p className="mb-4">No sections yet. Add a section to organize your tasks.</p>
            </div>
          )}
        </div>
      )
    }
    
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Not Found</h1>
        <p className="text-zinc-400">This view does not exist</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-zinc-950 flex">
      <Sidebar
        data={database}
        onAddTask={() => setShowAddTask(true)}
        currentView={view}
        onViewChange={handleViewChange}
        onProjectUpdate={handleProjectUpdate}
        onProjectDelete={handleProjectDelete}
        onAddProject={handleOpenAddProject}
        onAddProjectGeneral={handleOpenAddProjectGeneral}
        onAddOrganization={() => setShowAddOrganization(true)}
        onOrganizationDelete={openDeleteConfirmation}
        onOrganizationEdit={handleOpenEditOrganization}
        onOrganizationArchive={handleOrganizationArchive}
        onProjectEdit={handleOpenEditProject}
        onProjectsReorder={handleProjectsReorder}
        onOrganizationsReorder={handleOrganizationsReorder}
        isAddingTask={showAddTask}
      />
      
      <main className="flex-1 text-white overflow-y-auto">
        <div className={view === 'upcoming' ? 'p-8' : view === 'today' ? 'p-0' : 'max-w-4xl mx-auto p-8'}>
          {renderContent()}
        </div>
      </main>

      {undoCompletion && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={`${undoExiting ? 'animate-slide-down-out' : 'animate-slide-up-in'}`}>
            <div className="flex items-center gap-3 bg-black text-white border border-zinc-800 rounded-lg px-4 py-3 shadow-lg">
            <span className="text-sm">Completed "{undoCompletion.taskName}"</span>
            <button
              onClick={handleUndoComplete}
              className="text-sm font-semibold text-white hover:text-zinc-200 underline underline-offset-4"
            >
              Undo
            </button>
          </div>
          </div>
        </div>
      )}
      
      <AddTaskModal
        isOpen={showAddTask}
        onClose={() => setShowAddTask(false)}
        data={database}
        onAddTask={handleAddTask}
        onDataRefresh={fetchData}
        defaultProjectId={view.startsWith('project-') ? view.replace('project-', '') : undefined}
      />
      
      <EditTaskModal
        isOpen={showEditTask}
        onClose={() => {
          setShowEditTask(false)
          setEditingTask(null)
        }}
        task={editingTask}
        data={database}
        onSave={handleTaskSave}
        onDelete={handleTaskDelete}
        onDataRefresh={fetchData}
        onTaskSelect={(task) => {
          setEditingTask(task)
        }}
      />

      <BulkEditModal
        isOpen={showBulkEditModal}
        onClose={() => setShowBulkEditModal(false)}
        selectedTaskIds={selectedTaskIds}
        database={database}
        onApply={handleBulkUpdate}
        onDelete={handleBulkDelete}
        onInviteUser={handleInviteUser}
      />

      {selectedOrgForProject && (
        <AddProjectModal
          isOpen={showAddProject}
          onClose={() => {
            setShowAddProject(false)
            setSelectedOrgForProject(null)
          }}
          organizationId={selectedOrgForProject}
          onAddProject={handleAddProject}
        />
      )}
      
      <AddOrganizationModal
        isOpen={showAddOrganization}
        onClose={() => setShowAddOrganization(false)}
        onAddOrganization={handleAddOrganization}
      />
      
      <EditOrganizationModal
        isOpen={showEditOrganization}
        onClose={() => {
          setShowEditOrganization(false)
          setEditingOrganization(null)
        }}
        organization={editingOrganization}
        onUpdate={(updates) => {
          if (editingOrganization) {
            handleOrganizationUpdate(editingOrganization.id, updates)
          }
        }}
      />
      
      <EditProjectModal
        isOpen={showEditProject}
        onClose={() => {
          setShowEditProject(false)
          setEditingProject(null)
        }}
        project={editingProject}
        onUpdate={(updates) => {
          if (editingProject) {
            handleProjectUpdate(editingProject.id, updates)
          }
        }}
      />
      
      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, orgId: null, orgName: '' })}
        onConfirm={() => {
          if (confirmDelete.orgId) {
            handleOrganizationDelete(confirmDelete.orgId)
          }
        }}
        title="Delete Organization"
        description={`Are you sure you want to delete "${confirmDelete.orgName}"? This will permanently delete the organization and all its projects and tasks.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />

      <ConfirmModal
        isOpen={taskDeleteConfirm.show}
        onClose={() => setTaskDeleteConfirm({ show: false, taskId: null, taskName: '' })}
        onConfirm={confirmTaskDelete}
        title="Delete Task"
        description={`Are you sure you want to delete "${taskDeleteConfirm.taskName}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
      
      
      {view.startsWith('project-') && (
        <AddSectionModal
          isOpen={showAddSection}
          onClose={() => {
            setShowAddSection(false)
            setSectionParentId(undefined)
            setSectionOrder(0)
          }}
          onSave={handleAddSection}
          projectId={view.replace('project-', '')}
          parentId={sectionParentId}
          order={sectionOrder}
        />
      )}
      
      <ConfirmModal
        isOpen={showRescheduleConfirm}
        onClose={() => setShowRescheduleConfirm(false)}
        onConfirm={async () => {
          // Find all overdue tasks
          const overdueTasks = database.tasks.filter(task => {
            const dueDate = (task as any).due_date || task.dueDate
            if (!dueDate || task.completed) return false
            return isOverdue(dueDate)
          })
          
          // Update each overdue task to today's date
          const todayDate = getLocalDateString()
          const updatePromises = overdueTasks.map(task => 
            fetch(`/api/tasks/${task.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                dueDate: todayDate
              })
            })
          )
          
          try {
            await Promise.all(updatePromises)
            await fetchData() // Refresh the data
            setShowRescheduleConfirm(false)
          } catch (error) {
            console.error('Error rescheduling tasks:', error)
          }
        }}
        title="Reschedule Overdue Tasks"
        description={`Are you sure you want to reschedule ${database.tasks.filter(task => {
          const dueDate = (task as any).due_date || task.dueDate
          if (!dueDate || task.completed) return false
          return isOverdue(dueDate)
        }).length} overdue task(s) to today?`}
        confirmText="Reschedule All"
        cancelText="Cancel"
        variant="default"
      />

      <TodoistQuickSyncModal
        isOpen={showTodoistSync}
        onClose={() => setShowTodoistSync(false)}
        onSync={handleTodoistSync}
        userId={user?.id}
      />
    </div>
  )
}

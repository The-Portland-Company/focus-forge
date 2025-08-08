"use client"

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Archive, Trash2, Edit, Plus, Link2, Link2Off } from 'lucide-react'
import { Sidebar } from '@/components/sidebar'
import { filterTasksByBlockedStatus, isTaskBlocked } from '@/lib/dependency-utils'
import { AddTaskModal } from '@/components/add-task-modal'
import { EditTaskModal } from '@/components/edit-task-modal'
import { AddProjectModal } from '@/components/add-project-modal'
import { EditProjectModal } from '@/components/edit-project-modal'
import { AddOrganizationModal } from '@/components/add-organization-modal'
import { EditOrganizationModal } from '@/components/edit-organization-modal'
import { ConfirmModal } from '@/components/confirm-modal'
import { TaskList } from '@/components/task-list'
import { KanbanView } from '@/components/kanban-view'
import { ColorPicker } from '@/components/color-picker'
import { RescheduleConfirmModal } from '@/components/reschedule-confirm-modal'
import { RescheduleResultModal } from '@/components/reschedule-result-modal'
import { RescheduleProgressModal } from '@/components/reschedule-progress-modal'
import { Database, Task, Project, Organization, Section } from '@/lib/types'
import { SectionView } from '@/components/section-view'
import { AddSectionModal } from '@/components/add-section-modal'
import { AddSectionDivider } from '@/components/add-section-divider'
import { getLocalDateString, isOverdue, isTodayOrOverdue } from '@/lib/date-utils'

export default function ViewPage() {
  const params = useParams()
  const router = useRouter()
  const view = params.view as string
  
  const [database, setDatabase] = useState<Database | null>(null)
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
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false)
  const [showRescheduleResult, setShowRescheduleResult] = useState(false)
  const [showRescheduleProgress, setShowRescheduleProgress] = useState(false)
  const [rescheduleProgress, setRescheduleProgress] = useState({ current: 0, total: 0 })
  const [rescheduleResult, setRescheduleResult] = useState({ successCount: 0, failCount: 0 })
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([])
  const [sortBy, setSortBy] = useState<'dueDate' | 'deadline' | 'priority'>('dueDate')
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>('me-unassigned')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilter, setSearchFilter] = useState<'all' | 'tasks' | 'projects' | 'organizations'>('all')
  const [showBlockedTasks, setShowBlockedTasks] = useState(false)
  const [showAddSection, setShowAddSection] = useState(false)
  const [sectionParentId, setSectionParentId] = useState<string | undefined>(undefined)
  const [sectionOrder, setSectionOrder] = useState(0)
  const [editingSection, setEditingSection] = useState<Section | null>(null)

  useEffect(() => {
    fetchData()
  }, [])
  
  // Apply user settings in a separate effect to avoid hydration issues
  useEffect(() => {
    // Only access localStorage on the client side
    if (typeof window !== 'undefined') {
      const userColor = localStorage.getItem('userProfileColor')
      const animationsEnabled = localStorage.getItem('animationsEnabled')
      
      if (userColor) {
        document.documentElement.style.setProperty('--user-profile-color', userColor)
        document.documentElement.style.setProperty('--theme-gradient', userColor)
        
        // Handle gradients vs solid colors
        let primaryColor = userColor
        if (userColor.startsWith('linear-gradient')) {
          const matches = userColor.match(/#[A-Fa-f0-9]{6}/g)
          if (matches && matches.length > 0) {
            primaryColor = matches[0]
          }
        }
        
        // Set theme primary color
        document.documentElement.style.setProperty('--theme-primary', primaryColor)
        
        // Convert hex to RGB only if we have a valid hex color
        if (primaryColor.startsWith('#') && primaryColor.length === 7) {
          const hex = primaryColor.replace('#', '')
          const r = parseInt(hex.substr(0, 2), 16)
          const g = parseInt(hex.substr(2, 2), 16)
          const b = parseInt(hex.substr(4, 2), 16)
          
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            document.documentElement.style.setProperty('--user-profile-color-rgb', `${r}, ${g}, ${b}`)
            document.documentElement.style.setProperty('--theme-primary-rgb', `${r}, ${g}, ${b}`)
          } else {
            document.documentElement.style.setProperty('--user-profile-color-rgb', '234, 88, 12')
            document.documentElement.style.setProperty('--theme-primary-rgb', '234, 88, 12')
          }
        } else {
          document.documentElement.style.setProperty('--user-profile-color-rgb', '234, 88, 12')
          document.documentElement.style.setProperty('--theme-primary-rgb', '234, 88, 12')
        }
      }
      
      if (animationsEnabled === 'false') {
        document.documentElement.classList.add('no-animations')
      } else {
        document.documentElement.classList.remove('no-animations')
      }
    }
  }, [])

  const applyTheme = (userColor: string, animationsEnabled: boolean) => {
    const root = document.documentElement
    
    // Set user profile colors
    root.style.setProperty('--user-profile-color', userColor)
    root.style.setProperty('--theme-gradient', userColor)
    
    // Handle gradients vs solid colors
    let primaryColor = userColor
    if (userColor.startsWith('linear-gradient')) {
      const matches = userColor.match(/#[A-Fa-f0-9]{6}/g)
      if (matches && matches.length > 0) {
        primaryColor = matches[0]
      }
    }
    
    // Set theme primary color
    root.style.setProperty('--theme-primary', primaryColor)
    
    // Convert hex to RGB
    if (primaryColor.startsWith('#') && primaryColor.length === 7) {
      const hex = primaryColor.replace('#', '')
      const r = parseInt(hex.substr(0, 2), 16)
      const g = parseInt(hex.substr(2, 2), 16)
      const b = parseInt(hex.substr(4, 2), 16)
      
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        root.style.setProperty('--user-profile-color-rgb', `${r}, ${g}, ${b}`)
        root.style.setProperty('--theme-primary-rgb', `${r}, ${g}, ${b}`)
      } else {
        root.style.setProperty('--user-profile-color-rgb', '234, 88, 12')
        root.style.setProperty('--theme-primary-rgb', '234, 88, 12')
      }
    } else {
      root.style.setProperty('--user-profile-color-rgb', '234, 88, 12')
      root.style.setProperty('--theme-primary-rgb', '234, 88, 12')
    }
    
    // Toggle animations
    if (animationsEnabled) {
      root.classList.remove('no-animations')
    } else {
      root.classList.add('no-animations')
    }
  }

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
        
        // Apply user theme from database
        if (data.users?.[0]?.profileColor) {
          const userColor = data.users[0].profileColor
          const animationsEnabled = data.users[0].animationsEnabled !== false
          
          // Update localStorage
          localStorage.setItem('userProfileColor', userColor)
          localStorage.setItem('animationsEnabled', animationsEnabled.toString())
          
          // Apply theme immediately
          applyTheme(userColor, animationsEnabled)
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
        settings: { showCompletedTasks: true }
      })
    }
  }

  const handleAddTask = async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | Partial<Task>) => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    try {
      // Update the main task
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed: !task.completed,
          completedAt: !task.completed ? new Date().toISOString() : undefined
        })
      })
      
      if (response.ok) {
        // If we're completing a parent task, also complete all subtasks
        if (!task.completed) {
          const subtasks = database.tasks.filter(t => t.parentId === taskId)
          
          // Update all subtasks in parallel
          const updatePromises = subtasks.map(subtask => 
            fetch(`/api/tasks/${subtask.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                completed: true,
                completedAt: new Date().toISOString()
              })
            })
          )
          
          // Wait for all subtask updates to complete
          await Promise.all(updatePromises)
        }
        
        await fetchData()
      }
    } catch (error) {
      console.error('Error toggling task:', error)
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

  const handleTaskDelete = async (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'DELETE'
        })
        
        if (response.ok) {
          await fetchData()
        }
      } catch (error) {
        console.error('Error deleting task:', error)
      }
    }
  }

  const handleRescheduleAll = () => {
    if (!database || !database.tasks) return
    
    // Filter for overdue tasks only (not including today's tasks)
    const overdue = database.tasks.filter(task => {
      if (!task.dueDate || task.completed) return false
      return isOverdue(task.dueDate)
    })
    
    if (overdue.length === 0) {
      setRescheduleResult({ successCount: 0, failCount: 0 })
      setShowRescheduleResult(true)
      return
    }
    
    setOverdueTasks(overdue)
    setShowRescheduleConfirm(true)
  }
  
  const handleConfirmReschedule = async () => {
    setShowRescheduleConfirm(false)
    setShowRescheduleProgress(true)
    setRescheduleProgress({ current: 0, total: overdueTasks.length })
    
    // Get local date string (YYYY-MM-DD) without timezone conversion
    const today = getLocalDateString()
    const batchSize = 20 // Process 20 tasks at a time
    let totalSuccess = 0
    let totalFail = 0
    
    try {
      // Process tasks in batches using the batch endpoint
      for (let i = 0; i < overdueTasks.length; i += batchSize) {
        const batch = overdueTasks.slice(i, i + batchSize)
        const taskIds = batch.map(task => task.id)
        
        const response = await fetch('/api/tasks/batch-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds,
            updates: { dueDate: today }
          })
        })
        
        if (response.ok) {
          const result = await response.json()
          totalSuccess += result.successCount
          totalFail += result.failCount
        } else {
          totalFail += taskIds.length
        }
        
        // Update progress
        setRescheduleProgress({ 
          current: Math.min(i + batch.length, overdueTasks.length), 
          total: overdueTasks.length 
        })
        
        // Small delay between batches for UI responsiveness
        if (i + batchSize < overdueTasks.length) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
      
      await fetchData()
      
      setShowRescheduleProgress(false)
      setRescheduleResult({ successCount: totalSuccess, failCount: totalFail })
      setShowRescheduleResult(true)
    } catch (error) {
      console.error('Error rescheduling tasks:', error)
      setShowRescheduleProgress(false)
      setRescheduleResult({ successCount: totalSuccess, failCount: overdueTasks.length - totalSuccess })
      setShowRescheduleResult(true)
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
        method: 'DELETE'
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
        method: 'DELETE'
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
        const project = database?.projects.find(p => p.id === t.projectId)
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
        body: JSON.stringify(updates)
      })
      
      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Error updating organization:', error)
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
    const tasksInSection = database.taskSections?.filter(ts => ts.sectionId === sectionId).length || 0
    
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
          method: 'DELETE'
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
    return <div className="h-screen bg-zinc-950 flex items-center justify-center text-white">Loading...</div>
  }

  const sortTasks = (tasks: Task[]) => {
    return [...tasks].sort((a, b) => {
      switch (sortBy) {
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) return 0
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        
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

  const filterTasks = (tasks: Task[]) => {
    if (filterAssignedTo === 'all') {
      return tasks
    }
    
    const currentUserId = getCurrentUserId()
    
    if (filterAssignedTo === 'me-unassigned' && currentUserId) {
      return tasks.filter(task => task.assignedTo === currentUserId || !task.assignedTo)
    }
    
    if (filterAssignedTo === 'me' && currentUserId) {
      return tasks.filter(task => task.assignedTo === currentUserId)
    }
    
    if (filterAssignedTo === 'unassigned') {
      return tasks.filter(task => !task.assignedTo)
    }
    
    // Filter by specific user ID
    return tasks.filter(task => task.assignedTo === filterAssignedTo)
  }

  const renderContent = () => {
    if (view === 'today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      let todayTasks = database.tasks.filter(task => {
        if (!task.dueDate) return false
        // Show tasks due today or overdue (anything up to and including today)
        return isTodayOrOverdue(task.dueDate)
      })
      
      // Apply filters and sorting
      todayTasks = filterTasks(todayTasks)
      todayTasks = sortTasks(todayTasks)
      
      // Filter blocked tasks if needed
      if (!showBlockedTasks && database) {
        todayTasks = filterTasksByBlockedStatus(todayTasks, database.tasks, showBlockedTasks)
      }
      
      // Count overdue tasks specifically
      const overdueCount = database.tasks.filter(task => {
        if (!task.dueDate || task.completed) return false
        return isOverdue(task.dueDate)
      }).length
      
      return (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Today</h1>
            <div className="flex items-center gap-4">
              {overdueCount > 0 && (
                <button
                  onClick={handleRescheduleAll}
                  className="px-3 py-1 text-sm bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-md transition-colors"
                >
                  Reschedule {overdueCount} Overdue
                </button>
              )}
              <span className="text-sm text-zinc-400">
                {todayTasks.filter(t => !t.completed).length} tasks
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-400">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-zinc-800 text-white text-sm px-3 py-1 rounded border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all"
              >
                <option value="dueDate">Due Date</option>
                <option value="deadline">Deadline</option>
                <option value="priority">Priority</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-400">Assigned to:</label>
              <select
                value={filterAssignedTo}
                onChange={(e) => setFilterAssignedTo(e.target.value)}
                className="bg-zinc-800 text-white text-sm px-3 py-1 rounded border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all"
              >
                <option value="me-unassigned">Me + Unassigned</option>
                <option value="me">Me</option>
                <option value="all">All</option>
                <option value="unassigned">Unassigned</option>
                {database.users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => setShowBlockedTasks(!showBlockedTasks)}
              className={`flex items-center gap-2 text-sm px-3 py-1 rounded border transition-colors ${
                showBlockedTasks
                  ? 'bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600'
              }`}
              title={showBlockedTasks ? 'Hide blocked tasks' : 'Show blocked tasks'}
            >
              {showBlockedTasks ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
              {showBlockedTasks ? 'Showing Blocked' : 'Hiding Blocked'}
            </button>
          </div>
          
          <TaskList
            tasks={todayTasks}
            allTasks={database.tasks}
            showCompleted={database.settings?.showCompletedTasks ?? true}
            onTaskToggle={handleTaskToggle}
            onTaskEdit={handleTaskEdit}
            onTaskDelete={handleTaskDelete}
          />
        </div>
      )
    }
    
    if (view === 'upcoming') {
      // Get all tasks with due dates
      let upcomingTasks = database.tasks.filter(task => task.dueDate && !task.completed)
      
      // Filter blocked tasks if needed
      if (!showBlockedTasks && database) {
        upcomingTasks = filterTasksByBlockedStatus(upcomingTasks, database.tasks, showBlockedTasks)
      }
      
      const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
        try {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
        <div className="-ml-8 -mr-8">
          <div className="flex items-center justify-between mb-6 ml-8 mr-8">
            <h1 className="text-2xl font-bold">Upcoming</h1>
            <button
              onClick={() => setShowBlockedTasks(!showBlockedTasks)}
              className={`flex items-center gap-2 text-sm px-3 py-1 rounded border transition-colors ${
                showBlockedTasks
                  ? 'bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600'
              }`}
              title={showBlockedTasks ? 'Hide blocked tasks' : 'Show blocked tasks'}
            >
              {showBlockedTasks ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
              {showBlockedTasks ? 'Showing Blocked' : 'Hiding Blocked'}
            </button>
          </div>
          <div className="pl-8">
            <KanbanView
              tasks={upcomingTasks}
              allTasks={database.tasks}
              projects={database.projects}
              onTaskToggle={handleTaskToggle}
              onTaskEdit={handleTaskEdit}
              onTaskUpdate={handleTaskUpdate}
            />
          </div>
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
                  showCompleted={database.settings?.showCompletedTasks ?? true}
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
                    const taskCount = database.tasks.filter(t => t.projectId === project.id).length
                    
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
                  const taskCount = database.tasks.filter(t => t.projectId === project.id).length
                  const completedCount = database.tasks.filter(t => t.projectId === project.id && t.completed).length
                  
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
                    const taskCount = database.tasks.filter(t => t.projectId === project.id).length
                    
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
      const projectTasks = database.tasks.filter(t => t.projectId === projectId)
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
                showCompleted={database.settings?.showCompletedTasks ?? true}
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
        onProjectEdit={handleOpenEditProject}
        onProjectsReorder={handleProjectsReorder}
        onOrganizationsReorder={handleOrganizationsReorder}
      />
      
      <main className="flex-1 text-white overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {renderContent()}
        </div>
      </main>
      
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
      
      <RescheduleConfirmModal
        isOpen={showRescheduleConfirm}
        onClose={() => setShowRescheduleConfirm(false)}
        onConfirm={handleConfirmReschedule}
        taskCount={overdueTasks.length}
      />
      
      <RescheduleProgressModal
        isOpen={showRescheduleProgress}
        current={rescheduleProgress.current}
        total={rescheduleProgress.total}
      />
      
      <RescheduleResultModal
        isOpen={showRescheduleResult}
        onClose={() => setShowRescheduleResult(false)}
        successCount={rescheduleResult.successCount}
        failCount={rescheduleResult.failCount}
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
    </div>
  )
}
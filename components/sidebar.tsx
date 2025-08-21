"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Calendar, CalendarDays, Star, Hash, GripVertical, Trash2, Archive, FolderPlus, Building2, Edit, User, Settings, ChevronsUpDown, ChevronsDownUp, CheckSquare, Folder, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { Database, Project } from '@/lib/types'
import { getBackgroundStyle } from '@/lib/style-utils'
import { Tooltip } from './tooltip'

interface SidebarProps {
  data: Database
  onAddTask: () => void
  currentView: string
  onViewChange: (view: string) => void
  onProjectUpdate?: (projectId: string, updates: Partial<Project>) => void
  onProjectDelete?: (projectId: string) => void
  onProjectEdit?: (projectId: string) => void
  onAddProject?: (organizationId: string) => void
  onAddProjectGeneral?: () => void
  onAddOrganization?: () => void
  onOrganizationDelete?: (organizationId: string) => void
  onOrganizationEdit?: (organizationId: string) => void
  onOrganizationArchive?: (organizationId: string) => void
  onProjectsReorder?: (organizationId: string, projectIds: string[]) => void
  onOrganizationsReorder?: (organizationIds: string[]) => void
}

export function Sidebar({ data, onAddTask, currentView, onViewChange, onProjectUpdate, onProjectDelete, onProjectEdit, onAddProject, onAddProjectGeneral, onAddOrganization, onOrganizationDelete, onOrganizationEdit, onOrganizationArchive, onProjectsReorder, onOrganizationsReorder }: SidebarProps) {
  const router = useRouter()
  // Initialize with collapsed state by default
  const [expandedOrgs, setExpandedOrgs] = useState<string[]>([])
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false)
  const [showArchivedProjects, setShowArchivedProjects] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [draggedProject, setDraggedProject] = useState<string | null>(null)
  const [draggedOrg, setDraggedOrg] = useState<string | null>(null)
  const [dragOverOrg, setDragOverOrg] = useState<string | null>(null)
  const [dragOverProject, setDragOverProject] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null)
  const [hoveredProject, setHoveredProject] = useState<string | null>(null)
  const [hoveredOrg, setHoveredOrg] = useState<string | null>(null)

  // Load saved preferences from localStorage
  useEffect(() => {
    if (!hasLoadedPreferences) {
      // Load expanded organizations
      const storedOrgs = localStorage.getItem('expandedOrganizations')
      if (storedOrgs) {
        try {
          const parsed = JSON.parse(storedOrgs)
          if (Array.isArray(parsed)) {
            setExpandedOrgs(parsed)
          }
        } catch (e) {
          console.error('Failed to parse saved expanded organizations:', e)
        }
      }
      
      // Load collapsed state
      const storedCollapsed = localStorage.getItem('sidebarCollapsed')
      if (storedCollapsed === 'true') {
        setIsCollapsed(true)
      }
      
      setHasLoadedPreferences(true)
    }
  }, [hasLoadedPreferences])
  
  // Save expanded state to localStorage whenever it changes (only after initial load)
  useEffect(() => {
    if (hasLoadedPreferences) {
      const timeoutId = setTimeout(() => {
        localStorage.setItem('expandedOrganizations', JSON.stringify(expandedOrgs))
      }, 500) // Debounce to avoid too many updates
      
      return () => clearTimeout(timeoutId)
    }
  }, [expandedOrgs, hasLoadedPreferences])
  
  // Save collapsed state to localStorage
  useEffect(() => {
    if (hasLoadedPreferences) {
      localStorage.setItem('sidebarCollapsed', isCollapsed.toString())
    }
  }, [isCollapsed, hasLoadedPreferences])


  const toggleOrg = (orgId: string) => {
    setExpandedOrgs(prev =>
      prev.includes(orgId)
        ? prev.filter(id => id !== orgId)
        : [...prev, orgId]
    )
  }
  
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/auth/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const orgProjects = (orgId: string) => 
    data.projects
      .filter(project => (project.organizationId || project.organization_id) === orgId && !project.archived)
      .sort((a, b) => (a.order || 0) - (b.order || 0))

  return (
    <div className={`${isCollapsed ? 'w-[60px]' : 'w-[20%]'} h-full bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-300`}>
      <div className={`${isCollapsed ? 'p-2' : 'p-4'}`}>
        <div className="flex items-center justify-between mb-6">
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0"
                  style={getBackgroundStyle(data.users?.[0]?.profileColor)}
                >
                  {data.users?.[0]?.firstName?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="text-white font-medium">{data.users?.[0]?.firstName || 'User'}</div>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href="/settings"
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
                  title="Settings"
                >
                  <Settings className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                </button>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group mx-auto"
              title="Expand sidebar"
            >
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
            </button>
          )}
        </div>
        
        {!isCollapsed ? (
          <div className="flex gap-2">
            <button
              onClick={onAddTask}
              className="flex-1 btn-theme-primary text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-all"
              title="Add Task"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            
            <button
              onClick={onAddProjectGeneral}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
              title="Add Project"
            >
              <Folder className="w-4 h-4" />
            </button>
            
            <button
              onClick={onAddOrganization}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
              title="Add Organization"
            >
              <Building2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Tooltip content="Add Task">
              <button
                onClick={onAddTask}
                className="btn-theme-primary text-white rounded-lg p-2 flex items-center justify-center transition-all w-full"
              >
                <CheckSquare className="w-4 h-4" />
              </button>
            </Tooltip>
            
            <Tooltip content="Add Project">
              <button
                onClick={onAddProjectGeneral}
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg p-2 flex items-center justify-center transition-colors w-full"
              >
                <Folder className="w-4 h-4" />
              </button>
            </Tooltip>
            
            <Tooltip content="Add Organization">
              <button
                onClick={onAddOrganization}
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg p-2 flex items-center justify-center transition-colors w-full"
              >
                <Building2 className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <nav className={`flex-1 ${isCollapsed ? 'px-1' : 'px-2'} overflow-y-auto`}>
        {isCollapsed ? (
          <Tooltip content="Search">
            <Link
              href="/search"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === 'search' 
                  ? 'bg-zinc-800 text-white' 
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/search"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'search' 
                ? 'bg-zinc-800 text-white' 
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
            }`}
          >
            <Search className="w-4 h-4" />
            Search
          </Link>
        )}

        {isCollapsed ? (
          <Tooltip content="Today">
            <Link
              href="/today"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === 'today' 
                  ? 'bg-zinc-800 text-white' 
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/today"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'today' 
                ? 'bg-zinc-800 text-white' 
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Today
          </Link>
        )}

        {isCollapsed ? (
          <Tooltip content="Upcoming">
            <Link
              href="/upcoming"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === 'upcoming' 
                  ? 'bg-zinc-800 text-white' 
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/upcoming"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'upcoming' 
                ? 'bg-zinc-800 text-white' 
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Upcoming
          </Link>
        )}

        {isCollapsed ? (
          <Tooltip content="Calendar">
            <Link
              href="/calendar"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === 'calendar' 
                  ? 'bg-zinc-800 text-white' 
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/calendar"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === 'calendar' 
                ? 'bg-zinc-800 text-white' 
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Calendar
          </Link>
        )}

        {isCollapsed ? (
          <Tooltip content="Favorites">
            <Link
              href="/favorites"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors mb-4 ${
                currentView === 'favorites' 
                  ? 'bg-zinc-800 text-white' 
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
              }`}
            >
              <Star className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/favorites"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-4 ${
              currentView === 'favorites' 
                ? 'bg-zinc-800 text-white' 
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
            }`}
          >
            <Star className="w-4 h-4" />
            Favorites
          </Link>
        )}

        {!isCollapsed && (
          <div className="flex items-center justify-between px-3 py-2 mb-2">
            <span className="text-xs font-medium text-zinc-500 uppercase">Organizations</span>
            <button
              onClick={() => {
                const allOrgIds = data.organizations.map(org => org.id)
                if (expandedOrgs.length === allOrgIds.length) {
                  // All are expanded, so collapse all
                  setExpandedOrgs([])
                } else {
                  // Some or none are expanded, so expand all
                  setExpandedOrgs(allOrgIds)
                }
              }}
              className="p-1 rounded hover:bg-zinc-800 transition-colors group"
              title={expandedOrgs.length === data.organizations.length ? "Collapse all" : "Expand all"}
            >
              {expandedOrgs.length === data.organizations.length ? (
                <ChevronsDownUp className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
              ) : (
                <ChevronsUpDown className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
              )}
            </button>
          </div>
        )}

        <div className="space-y-0">
          {isCollapsed ? (
            // Collapsed view - show only organization dots
            data.organizations
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map(org => (
                <Tooltip key={org.id} content={org.name}>
                  <Link
                    href={`/org-${org.id}`}
                    className={`w-full flex items-center justify-center px-2 py-2 rounded-lg transition-colors ${
                      currentView === `org-${org.id}`
                        ? 'bg-zinc-800' 
                        : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    <div 
                      className="w-5 h-5 rounded-full" 
                      style={{ backgroundColor: org.color }} 
                    />
                  </Link>
                </Tooltip>
              ))
          ) : (
            // Expanded view - show full organization structure
            data.organizations
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map(org => (
            <div 
              key={org.id}
              draggable
              onMouseEnter={() => setHoveredOrg(org.id)}
              onMouseLeave={() => setHoveredOrg(null)}
              onDragStart={(e) => {
                setDraggedOrg(org.id)
                e.dataTransfer.effectAllowed = 'move'
                setTimeout(() => {
                  e.currentTarget.classList.add('dragging')
                }, 0)
              }}
              onDragEnd={(e) => {
                e.currentTarget.classList.remove('dragging')
                setDraggedOrg(null)
                setDragOverOrg(null)
                setDragOverPosition(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (draggedProject && !draggedOrg) {
                  // Dragging a project over an organization
                  setDragOverOrg(org.id)
                } else if (draggedOrg && draggedOrg !== org.id) {
                  // Dragging an organization
                  const rect = e.currentTarget.getBoundingClientRect()
                  const y = e.clientY - rect.top
                  const height = rect.height
                  setDragOverOrg(org.id)
                  setDragOverPosition(y < height / 2 ? 'top' : 'bottom')
                }
              }}
              onDragLeave={() => {
                setDragOverOrg(null)
                setDragOverPosition(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (draggedProject && onProjectUpdate) {
                  // Get the project being dragged
                  const project = data.projects.find(p => p.id === draggedProject)
                  if (project && project.organizationId !== org.id) {
                    // Moving to a different organization
                    onProjectUpdate(draggedProject, { organizationId: org.id })
                  }
                } else if (draggedOrg && draggedOrg !== org.id && onOrganizationsReorder) {
                  // Reorder organizations
                  const orgs = data.organizations.sort((a, b) => (a.order || 0) - (b.order || 0))
                  const draggedIndex = orgs.findIndex(o => o.id === draggedOrg)
                  const targetIndex = orgs.findIndex(o => o.id === org.id)
                  
                  if (draggedIndex !== -1 && targetIndex !== -1) {
                    const newOrgs = [...orgs]
                    const [removed] = newOrgs.splice(draggedIndex, 1)
                    
                    // Insert based on drop position
                    const insertIndex = dragOverPosition === 'bottom' ? targetIndex + 1 : targetIndex
                    newOrgs.splice(insertIndex > draggedIndex ? insertIndex - 1 : insertIndex, 0, removed)
                    
                    onOrganizationsReorder(newOrgs.map(o => o.id))
                  }
                }
                setDraggedProject(null)
                setDraggedOrg(null)
                setDragOverOrg(null)
                setDragOverPosition(null)
              }}
              className={`rounded-lg transition-all cursor-move ${
                draggedOrg === org.id ? 'opacity-50' : ''
              } ${
                dragOverOrg === org.id && draggedOrg && dragOverPosition === 'top' ? 'drag-over-top' : ''
              } ${
                dragOverOrg === org.id && draggedOrg && dragOverPosition === 'bottom' ? 'drag-over-bottom' : ''
              } ${
                dragOverOrg === org.id && draggedProject ? 'bg-zinc-800/50' : ''
              }`}
            >
              <div className="relative flex items-center px-3 py-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    onClick={() => toggleOrg(org.id)}
                    className="text-sm text-zinc-400 hover:text-white transition-colors p-1 flex-shrink-0"
                  >
                    <span className={`transform transition-transform block ${expandedOrgs.includes(org.id) ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                  </button>
                  <Link
                    href={`/org-${org.id}`}
                    className={`flex-1 text-sm transition-colors flex items-center gap-2 min-w-0 ${
                      currentView === `org-${org.id}`
                        ? 'text-white' 
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: org.color }} 
                    />
                    <span className="truncate">{org.name}</span>
                  </Link>
                </div>
                {hoveredOrg === org.id && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-900 rounded-lg px-1">
                    <button
                      onClick={() => onAddProject?.(org.id)}
                      className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                      title="Add project"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onOrganizationEdit?.(org.id)}
                      className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                      title="Edit organization"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onOrganizationArchive?.(org.id)}
                      className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                      title="Archive organization"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    {org.ownerId === data.users?.[0]?.id && (
                      <button
                        onClick={() => onOrganizationDelete?.(org.id)}
                        className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                        title="Delete organization"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {expandedOrgs.includes(org.id) && (
                <div className="ml-4 space-y-1">
                  {orgProjects(org.id).map(project => (
                    <div
                      key={project.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedProject(project.id)
                        e.dataTransfer.effectAllowed = 'move'
                        // Add ghost class after a small delay
                        setTimeout(() => {
                          e.currentTarget.classList.add('dragging')
                        }, 0)
                      }}
                      onDragEnd={(e) => {
                        e.currentTarget.classList.remove('dragging')
                        setDraggedProject(null)
                        setDragOverOrg(null)
                        setDragOverProject(null)
                        setDragOverPosition(null)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (draggedProject && draggedProject !== project.id) {
                          const rect = e.currentTarget.getBoundingClientRect()
                          const y = e.clientY - rect.top
                          const height = rect.height
                          setDragOverProject(project.id)
                          setDragOverPosition(y < height / 2 ? 'top' : 'bottom')
                        }
                      }}
                      onDragLeave={() => {
                        setDragOverProject(null)
                        setDragOverPosition(null)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (draggedProject && draggedProject !== project.id && onProjectsReorder) {
                          const draggedProj = data.projects.find(p => p.id === draggedProject)
                          if (draggedProj && (draggedProj.organizationId || draggedProj.organization_id) === (project.organizationId || project.organization_id)) {
                            // Reorder within the same organization
                            const projects = orgProjects(org.id)
                            const draggedIndex = projects.findIndex(p => p.id === draggedProject)
                            const targetIndex = projects.findIndex(p => p.id === project.id)
                            
                            if (draggedIndex !== -1 && targetIndex !== -1) {
                              const newProjects = [...projects]
                              const [removed] = newProjects.splice(draggedIndex, 1)
                              
                              // Insert based on drop position
                              const insertIndex = dragOverPosition === 'bottom' ? targetIndex + 1 : targetIndex
                              newProjects.splice(insertIndex > draggedIndex ? insertIndex - 1 : insertIndex, 0, removed)
                              
                              onProjectsReorder(org.id, newProjects.map(p => p.id))
                            }
                          }
                        }
                        setDraggedProject(null)
                        setDragOverProject(null)
                      }}
                      onMouseEnter={() => setHoveredProject(project.id)}
                      onMouseLeave={() => setHoveredProject(null)}
                      className="cursor-move relative group"
                    >
                      <div
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                          currentView === `project-${project.id}`
                            ? 'bg-zinc-800 text-white' 
                            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                        } ${
                          dragOverProject === project.id && dragOverPosition === 'top' ? 'drag-over-top' : ''
                        } ${
                          dragOverProject === project.id && dragOverPosition === 'bottom' ? 'drag-over-bottom' : ''
                        }`}
                      >
                        <GripVertical className="w-3 h-3 opacity-40" />
                        <Link
                          href={`/project-${project.id}`}
                          className="flex items-center gap-2 flex-1"
                        >
                          <div 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: project.color }} 
                          />
                          {project.name}
                        </Link>
                        {hoveredProject === project.id && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (onProjectEdit) {
                                  onProjectEdit(project.id)
                                }
                              }}
                              className="p-1 hover:bg-zinc-700 rounded transition-colors"
                              title="Edit project"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (onProjectUpdate) {
                                  onProjectUpdate(project.id, { archived: true })
                                }
                              }}
                              className="p-1 hover:bg-zinc-700 rounded transition-colors"
                              title="Archive project"
                            >
                              <Archive className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm(`Are you sure you want to delete "${project.name}"? This will also delete all tasks in this project.`)) {
                                  if (onProjectDelete) {
                                    onProjectDelete(project.id)
                                  }
                                }
                              }}
                              className="p-1 hover:bg-zinc-700 rounded transition-colors"
                              title="Delete project"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
          )}
        </div>

        {/* Archived Projects Section */}
        {!isCollapsed && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between px-3 py-2 mb-2">
              <button
                onClick={() => setShowArchivedProjects(!showArchivedProjects)}
                className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase hover:text-zinc-300 transition-colors"
              >
                <span className={`transform transition-transform ${showArchivedProjects ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                Archived Projects
              </button>
            </div>
          
          {showArchivedProjects && (
            <div className="space-y-1 px-2">
              {data.projects
                .filter(project => project.archived)
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(project => {
                  const org = data.organizations.find(o => o.id === project.organizationId)
                  return (
                    <div
                      key={project.id}
                      className="group"
                      onMouseEnter={() => setHoveredProject(project.id)}
                      onMouseLeave={() => setHoveredProject(null)}
                    >
                      <div
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                          currentView === `project-${project.id}`
                            ? 'bg-zinc-800 text-white' 
                            : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400'
                        }`}
                      >
                        <Link
                          href={`/project-${project.id}`}
                          className="flex items-center gap-2 flex-1"
                        >
                          <div 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: project.color }} 
                          />
                          <span>{project.name}</span>
                          {org && (
                            <span className="text-xs text-zinc-600">({org.name})</span>
                          )}
                        </Link>
                        {hoveredProject === project.id && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (onProjectUpdate) {
                                  onProjectUpdate(project.id, { archived: false })
                                }
                              }}
                              className="p-1 hover:bg-zinc-700 rounded transition-colors"
                              title="Restore project"
                            >
                              <Archive className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm(`Are you sure you want to permanently delete "${project.name}"? This will also delete all tasks in this project.`)) {
                                  if (onProjectDelete) {
                                    onProjectDelete(project.id)
                                  }
                                }
                              }}
                              className="p-1 hover:bg-zinc-700 rounded transition-colors"
                              title="Delete project"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              {data.projects.filter(p => p.archived).length === 0 && (
                <div className="px-3 py-2 text-xs text-zinc-600">No archived projects</div>
              )}
            </div>
          )}
          </div>
        )}
      </nav>
      
      {/* Bottom section for collapsed sidebar */}
      {isCollapsed && (
        <div className="p-2 border-t border-zinc-800">
          <div className="space-y-1">
            <Tooltip content="Settings">
              <Link
                href="/settings"
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                <Settings className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              </Link>
            </Tooltip>
            <Tooltip content="Logout">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                <LogOut className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
}
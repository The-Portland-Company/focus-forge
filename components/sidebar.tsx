"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Search, Calendar, CalendarDays, Star, Hash, GripVertical, Trash2, Archive, FolderPlus, Building2, Edit, User, Settings, ChevronsUpDown, ChevronsDownUp } from 'lucide-react'
import { Database, Project } from '@/lib/types'
import { getBackgroundStyle } from '@/lib/style-utils'

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
  onProjectsReorder?: (organizationId: string, projectIds: string[]) => void
  onOrganizationsReorder?: (organizationIds: string[]) => void
}

export function Sidebar({ data, onAddTask, currentView, onViewChange, onProjectUpdate, onProjectDelete, onProjectEdit, onAddProject, onAddProjectGeneral, onAddOrganization, onOrganizationDelete, onOrganizationEdit, onProjectsReorder, onOrganizationsReorder }: SidebarProps) {
  // Initialize with default state to avoid hydration mismatch
  const [expandedOrgs, setExpandedOrgs] = useState<string[]>(data.organizations.map(org => org.id))
  const [draggedProject, setDraggedProject] = useState<string | null>(null)
  const [draggedOrg, setDraggedOrg] = useState<string | null>(null)
  const [dragOverOrg, setDragOverOrg] = useState<string | null>(null)
  const [dragOverProject, setDragOverProject] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null)
  const [hoveredProject, setHoveredProject] = useState<string | null>(null)
  const [hoveredOrg, setHoveredOrg] = useState<string | null>(null)

  // Load saved expanded state after mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('expandedOrgs')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setExpandedOrgs(parsed)
        } catch (e) {
          console.error('Error parsing expandedOrgs from localStorage:', e)
        }
      }
    }
  }, [])
  
  // Save expanded state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('expandedOrgs', JSON.stringify(expandedOrgs))
    }
  }, [expandedOrgs])


  const toggleOrg = (orgId: string) => {
    setExpandedOrgs(prev =>
      prev.includes(orgId)
        ? prev.filter(id => id !== orgId)
        : [...prev, orgId]
    )
  }

  const orgProjects = (orgId: string) => 
    data.projects
      .filter(project => project.organizationId === orgId && !project.archived)
      .sort((a, b) => (a.order || 0) - (b.order || 0))

  return (
    <div className="w-[20%] h-full bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0"
              style={getBackgroundStyle(data.users?.[0]?.profileColor)}
            >
              {data.users?.[0]?.firstName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="text-white font-medium">{data.users?.[0]?.firstName || 'User'}</div>
          </div>
          <Link
            href="/settings"
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
          </Link>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={onAddTask}
            className="flex-1 btn-theme-primary text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-all"
            title="Add Task"
          >
            <Plus className="w-4 h-4" />
            <span>Task</span>
          </button>
          
          <button
            onClick={onAddProjectGeneral}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
            title="Add Project"
          >
            <Plus className="w-4 h-4" />
            <span>Project</span>
          </button>
          
          <button
            onClick={onAddOrganization}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
            title="Add Organization"
          >
            <Plus className="w-4 h-4" />
            <span>Organization</span>
          </button>
        </div>
      </div>

      <nav className="flex-1 px-2 overflow-y-auto">
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

        <div className="space-y-1">
          {data.organizations
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
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => toggleOrg(org.id)}
                    className="text-sm text-zinc-400 hover:text-white transition-colors p-1"
                  >
                    <span className={`transform transition-transform block ${expandedOrgs.includes(org.id) ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                  </button>
                  <Link
                    href={`/org-${org.id}`}
                    className={`flex-1 text-sm transition-colors flex items-center gap-2 ${
                      currentView === `org-${org.id}`
                        ? 'text-white' 
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: org.color }} 
                    />
                    {org.name}
                  </Link>
                </div>
                {hoveredOrg === org.id && (
                  <div className="flex items-center gap-1">
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
                          if (draggedProj && draggedProj.organizationId === project.organizationId) {
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
          ))}
        </div>
      </nav>
    </div>
  )
}
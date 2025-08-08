"use client"

import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, MoreHorizontal, Edit, Trash2, Plus, GripVertical } from 'lucide-react'
import { Section, Task, Database, UserSectionPreference } from '@/lib/types'
import { TaskList } from './task-list'

interface SectionViewProps {
  section: Section
  tasks: Task[]
  allTasks: Task[]
  database: Database
  level?: number
  onTaskToggle: (taskId: string) => void
  onTaskEdit: (task: Task) => void
  onTaskDelete: (taskId: string) => void
  onSectionEdit: (section: Section) => void
  onSectionDelete: (sectionId: string) => void
  onAddSection: (parentId: string) => void
  onTaskDrop: (taskId: string, sectionId: string) => void
  onSectionReorder: (sectionId: string, newOrder: number) => void
  userId: string
}

export function SectionView({
  section,
  tasks,
  allTasks,
  database,
  level = 0,
  onTaskToggle,
  onTaskEdit,
  onTaskDelete,
  onSectionEdit,
  onSectionDelete,
  onAddSection,
  onTaskDrop,
  onSectionReorder,
  userId
}: SectionViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  
  // Load collapsed state from user preferences
  useEffect(() => {
    const preference = database.userSectionPreferences?.find(
      pref => pref.userId === userId && pref.sectionId === section.id
    )
    if (preference) {
      setIsCollapsed(preference.isCollapsed)
    }
  }, [database.userSectionPreferences, userId, section.id])
  
  // Get tasks for this section
  const sectionTasks = tasks.filter(task => {
    const taskSections = database.taskSections?.filter(ts => ts.taskId === task.id) || []
    return taskSections.some(ts => ts.sectionId === section.id)
  })
  
  // Get child sections
  const childSections = database.sections?.filter(s => s.parentId === section.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0)) || []
  
  const handleToggleCollapse = async () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)
    
    // Save preference
    try {
      await fetch('/api/user-section-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sectionId: section.id,
          isCollapsed: newCollapsed
        })
      })
    } catch (error) {
      console.error('Failed to save section preference:', error)
    }
  }
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) {
      onTaskDrop(taskId, section.id)
    }
  }
  
  return (
    <div 
      className={`${level > 0 ? 'ml-6' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Section Header */}
      <div 
        className={`flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800/50 group transition-all cursor-pointer ${
          dragOver ? 'bg-zinc-800/50 ring-2 ring-[var(--theme-primary)]' : ''
        }`}
        onClick={handleToggleCollapse}
      >
        <button className="p-1">
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>
        
        <div className="flex items-center gap-2 flex-1">
          <span className="text-lg">{section.icon}</span>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: section.color }}
          />
          <span className="font-medium text-white">{section.name}</span>
          <span className="text-sm text-zinc-500">
            ({sectionTasks.length})
          </span>
        </div>
        
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddSection(section.id)
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Add subsection"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSectionEdit(section)
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Edit section"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSectionDelete(section.id)
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors text-red-400"
            title="Delete section"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <GripVertical className="w-4 h-4 text-zinc-500 cursor-move" />
        </div>
      </div>
      
      {/* Section Content */}
      {!isCollapsed && (
        <div className="ml-6 mt-2">
          {/* Section Description */}
          {section.description && (
            <p className="text-sm text-zinc-400 mb-3 ml-6">
              {section.description}
            </p>
          )}
          
          {/* Tasks in this section */}
          {sectionTasks.length > 0 && (
            <div className="mb-4">
              <TaskList
                tasks={sectionTasks}
                allTasks={allTasks}
                showCompleted={database.settings?.showCompletedTasks ?? true}
                onTaskToggle={onTaskToggle}
                onTaskEdit={onTaskEdit}
                onTaskDelete={onTaskDelete}
              />
            </div>
          )}
          
          {/* Child sections */}
          {childSections.map(childSection => (
            <SectionView
              key={childSection.id}
              section={childSection}
              tasks={tasks}
              allTasks={allTasks}
              database={database}
              level={level + 1}
              onTaskToggle={onTaskToggle}
              onTaskEdit={onTaskEdit}
              onTaskDelete={onTaskDelete}
              onSectionEdit={onSectionEdit}
              onSectionDelete={onSectionDelete}
              onAddSection={onAddSection}
              onTaskDrop={onTaskDrop}
              onSectionReorder={onSectionReorder}
              userId={userId}
            />
          ))}
        </div>
      )}
    </div>
  )
}